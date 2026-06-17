/**
 * Wave A — HTTP surface (plan.md §5.2 / §5.3 / §6).
 *
 * VAPI talks to us over HTTP:
 *   - POST /vapi/webhook           — lifecycle + end-of-call report (cost/latency).
 *   - POST /tools/lookup_knowledge — receptionist tool: FAQ/policy retrieval.
 *   - POST /tools/check_availability — receptionist tool: hours/slots.
 *   - POST /tools/book_appointment — receptionist tool: structured booking.
 *
 * Principles:
 *   - Webhook: VERIFY the X-Vapi-Secret header, ACK 200 immediately, do heavy
 *     work in a scheduled internalMutation (ctx.scheduler.runAfter(0, ...)).
 *   - Tools: "respond first, log after" — run the indexed query/mutation, return
 *     VAPI's expected { results: [{ toolCallId, result }] } shape, THEN emit a
 *     span via the scheduler (fire-and-forget).
 *
 * The exact VAPI payload nesting is parsed DEFENSIVELY; uncertain spots carry a
 * `// TODO(vapi-shape)` so they can be reconciled against live webhook bodies.
 *
 * Env vars read: VAPI_PRIVATE_KEY (webhook shared secret).
 */
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { RECEPTIONIST_TOOL_NAMES } from "./_contracts";
import type { Id } from "./_generated/dataModel";
import {
  normalizeVapiEndOfCallReport,
  engineReportToRecordArgs,
} from "./lib/vapiReport";

const http = httpRouter();

// ════════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════════

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Safely read a deeply-nested property without throwing. */
function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function asNumber(x: unknown, fallback = 0): number {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function asString(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

/**
 * VAPI nests the actual server message under `message` in most webhooks. Return
 * the message object (or the body itself as a fallback).
 * TODO(vapi-shape): confirm the top-level envelope key against a live body.
 */
function unwrapMessage(body: unknown): Record<string, unknown> {
  const msg = pick(body, "message");
  if (msg && typeof msg === "object") return msg as Record<string, unknown>;
  if (body && typeof body === "object") return body as Record<string, unknown>;
  return {};
}

// ── tool-call extraction ────────────────────────────────────────────────────────
//
// VAPI sends tool calls under message.toolCallList (newer) or message.toolCalls
// / message.toolWithToolCallList. Each entry carries an `id` and a
// `function.arguments` (object OR JSON string). We normalize to { id, args }.
interface NormalizedToolCall {
  id: string;
  name?: string;
  args: Record<string, unknown>;
}

function extractToolCalls(body: unknown): NormalizedToolCall[] {
  const msg = unwrapMessage(body);
  // TODO(vapi-shape): VAPI has shipped several shapes here over time; cover the
  // common ones and fall back gracefully.
  const candidates =
    (msg.toolCallList as unknown[] | undefined) ??
    (msg.toolCalls as unknown[] | undefined) ??
    (pick(msg, "toolWithToolCallList") as unknown[] | undefined) ??
    [];

  const out: NormalizedToolCall[] = [];
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    // The tool call may be the entry itself, or nested under `.toolCall`.
    const tc = (r.toolCall as Record<string, unknown> | undefined) ?? r;

    const id =
      asString(tc.id) ??
      asString(r.id) ??
      asString(pick(tc, "function", "name")) ??
      "";

    const fn = (tc.function as Record<string, unknown> | undefined) ?? {};
    const name = asString(fn.name) ?? asString(tc.name);

    let args: Record<string, unknown> = {};
    const rawArgs = fn.arguments ?? tc.arguments ?? r.arguments;
    if (typeof rawArgs === "string") {
      try {
        const parsed = JSON.parse(rawArgs);
        if (parsed && typeof parsed === "object") {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // leave args empty on malformed JSON
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }

    out.push({ id: id || crypto.randomUUID(), name, args });
  }
  return out;
}

/** Emit a fire-and-forget span via the telemetry sink (off the critical path). */
async function emitToolSpan(
  ctx: { scheduler: { runAfter: (ms: number, fn: any, args: any) => Promise<unknown> } },
  opts: {
    traceId: string;
    spanId: string;
    label: string;
    startMs: number;
    endMs: number;
    attrs?: Record<string, string | number | boolean>;
  },
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(0, internal.telemetry.writeSpanInternal, {
      span: {
        traceId: opts.traceId,
        spanId: opts.spanId,
        kind: "tool" as const,
        label: opts.label,
        startMs: opts.startMs,
        endMs: opts.endMs,
        durationMs: Math.max(0, opts.endMs - opts.startMs),
        attrs: opts.attrs,
      },
    });
  } catch {
    // Telemetry is best-effort; never let it affect the tool response.
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// /vapi/webhook
// ════════════════════════════════════════════════════════════════════════════════

const vapiWebhook = httpAction(async (ctx, request) => {
  // 1. Verify the shared secret. VAPI sends it on the `X-Vapi-Secret` header
  //    (the value of `server.secret` configured on the assistant).
  // The transient assistant is built client-side, so `server.secret` must be a
  // client-safe value: we use the (public) VAPI public key and also accept the
  // private key for any server-initiated calls.
  const provided = request.headers.get("X-Vapi-Secret");
  const ok =
    !!provided &&
    (provided === process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ||
      provided === process.env.VAPI_PRIVATE_KEY);
  if (!ok) {
    return json({ error: "unauthorized" }, 401);
  }

  // 2. Parse the body defensively.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: true, ignored: "unparseable_body" }, 200);
  }

  const msg = unwrapMessage(body);
  const type = asString(msg.type) ?? "";

  // 3. Branch on message type. ACK 200 in every branch; heavy work is scheduled.
  switch (type) {
    case "end-of-call-report": {
      const report = normalizeVapiEndOfCallReport(body);
      if (report) {
        // Off-path: finalize the call in a scheduled internal mutation.
        await ctx.scheduler.runAfter(
          0,
          internal.calls.recordEndOfCall,
          engineReportToRecordArgs(report),
        );
      }
      return json({ ok: true }, 200);
    }

    case "status-update": {
      // Minimal handling: we mostly drive live state from the Web SDK client.
      // TODO(vapi-shape): could map status → calls.status here if desired.
      return json({ ok: true }, 200);
    }

    case "tool-calls": {
      // VAPI can deliver tool calls via the server webhook too. We expose the
      // dedicated /tools/* endpoints as the canonical path; ack here so VAPI
      // doesn't retry. TODO(vapi-shape): confirm whether tool calls arrive
      // here vs. only at the per-tool server.url.
      return json({ ok: true }, 200);
    }

    default:
      // Unknown / unhandled message types: ack so VAPI stops retrying.
      return json({ ok: true, ignored: type || "unknown" }, 200);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// /tools/* — receptionist tools
// ════════════════════════════════════════════════════════════════════════════════

/** Build the VAPI tool response envelope. */
function toolResponse(toolCallId: string, result: unknown): Response {
  return json({ results: [{ toolCallId, result }] }, 200);
}

// ── lookup_knowledge ──────────────────────────────────────────────────────────
const lookupKnowledgeTool = httpAction(async (ctx, request) => {
  const startMs = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ results: [] }, 200);
  }
  const call = extractToolCalls(body)[0];
  const args = call?.args ?? {};
  const toolCallId = call?.id ?? "";

  const businessId = asString(args.businessId) as Id<"businesses"> | undefined;
  const query = asString(args.query) ?? "";

  if (!businessId || !query) {
    const result = { found: false, chunks: [] };
    return toolResponse(toolCallId, result);
  }

  const result = await ctx.runQuery(internal.tools.lookupKnowledge, {
    businessId,
    query,
    limit: typeof args.limit === "number" ? args.limit : undefined,
  });

  // Respond first; span after.
  const res = toolResponse(toolCallId, result);
  await emitToolSpan(ctx, {
    traceId: businessId,
    spanId: `tool_lookup_${startMs}`,
    label: RECEPTIONIST_TOOL_NAMES.lookupKnowledge,
    startMs,
    endMs: Date.now(),
    attrs: { found: result.found, chunks: result.chunks.length },
  });
  return res;
});

// ── check_availability ────────────────────────────────────────────────────────
const checkAvailabilityTool = httpAction(async (ctx, request) => {
  const startMs = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ results: [] }, 200);
  }
  const call = extractToolCalls(body)[0];
  const args = call?.args ?? {};
  const toolCallId = call?.id ?? "";

  const businessId = asString(args.businessId) as Id<"businesses"> | undefined;
  const date = asString(args.date) ?? new Date().toISOString().slice(0, 10);

  if (!businessId) {
    const result = { available: false, date, slots: [], note: "Missing business." };
    return toolResponse(toolCallId, result);
  }

  const result = await ctx.runQuery(internal.tools.checkAvailability, {
    businessId,
    date,
    preferredTime: asString(args.preferredTime),
    service: asString(args.service),
  });

  const res = toolResponse(toolCallId, result);
  await emitToolSpan(ctx, {
    traceId: businessId,
    spanId: `tool_avail_${startMs}`,
    label: RECEPTIONIST_TOOL_NAMES.checkAvailability,
    startMs,
    endMs: Date.now(),
    attrs: { available: result.available, slots: result.slots.length },
  });
  return res;
});

// ── book_appointment ──────────────────────────────────────────────────────────
const bookAppointmentTool = httpAction(async (ctx, request) => {
  const startMs = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ results: [] }, 200);
  }
  const call = extractToolCalls(body)[0];
  const args = call?.args ?? {};
  const toolCallId = call?.id ?? "";

  const businessId = asString(args.businessId) as Id<"businesses"> | undefined;
  const slot = asString(args.slot) ?? "";
  const customerName = asString(args.customerName) ?? "";
  const contact = asString(args.contact) ?? "";

  if (!businessId || !slot || !customerName || !contact) {
    const result = {
      booked: false,
      confirmationId: "",
      slot,
      message: "Missing required booking details.",
    };
    return toolResponse(toolCallId, result);
  }

  const result = await ctx.runMutation(internal.tools.bookAppointment, {
    businessId,
    slot,
    customerName,
    contact,
    service: asString(args.service),
    notes: asString(args.notes),
    idempotencyKey: asString(args.idempotencyKey),
  });

  const res = toolResponse(toolCallId, result);
  await emitToolSpan(ctx, {
    traceId: businessId,
    spanId: `tool_book_${startMs}`,
    label: RECEPTIONIST_TOOL_NAMES.bookAppointment,
    startMs,
    endMs: Date.now(),
    attrs: { booked: result.booked },
  });
  return res;
});

// ════════════════════════════════════════════════════════════════════════════════
// Routes
// ════════════════════════════════════════════════════════════════════════════════

http.route({ path: "/vapi/webhook", method: "POST", handler: vapiWebhook });
http.route({
  path: "/tools/lookup_knowledge",
  method: "POST",
  handler: lookupKnowledgeTool,
});
http.route({
  path: "/tools/check_availability",
  method: "POST",
  handler: checkAvailabilityTool,
});
http.route({
  path: "/tools/book_appointment",
  method: "POST",
  handler: bookAppointmentTool,
});

export default http;
