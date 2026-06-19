/**
 * VAPI **server webhook** envelope — the ONE owner of how VAPI nests its webhook
 * bodies (the payloads POSTed to /vapi/webhook and the /tools/* endpoints).
 *
 * This module owns the SERVER webhook shape only. The VAPI **Web SDK client
 * message** shape (a different payload) is a separate concern parsed in
 * `lib/vapi/use-vapi-call.ts`; Convex bundles `convex/` separately from `lib/`,
 * so the two are intentionally NOT unified into a single cross-runtime module.
 *
 * PURE: no Date.now()/Math.random(), no IO, no "use node". Safe to import from
 * any Convex runtime (httpAction, query, mutation).
 */

/** Safely read a deeply-nested property without throwing. */
export function pick(obj: unknown, ...path: string[]): unknown {
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

export function asString(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

export function num(x: unknown): number | undefined {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function str(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

/**
 * VAPI nests the actual server message under `message` in most webhooks. Return
 * the message object (or the body itself as a fallback).
 * TODO(vapi-shape): confirm the top-level envelope key against a live body.
 */
export function unwrapMessage(body: unknown): Record<string, unknown> {
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
export interface NormalizedToolCall {
  id: string;
  name?: string;
  args: Record<string, unknown>;
}

export function extractToolCalls(body: unknown): NormalizedToolCall[] {
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
