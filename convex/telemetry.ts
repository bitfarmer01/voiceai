/**
 * Wave A / Phase 3 — Telemetry off the critical path (plan.md §5.3).
 *
 * `batchWriteSpans` is the sink the Web SDK client flushes derived OTel spans
 * into. The live call renders from local React state; spans are flushed here on
 * a timer (~5s) and once more on call-end, so this is NEVER on the audio render
 * path. As of Phase 3 the client is the SINGLE source of truth for the trace
 * (turn/stt/llm/tts + tool spans, all on one clock), so there is no server-side
 * span sink — the old wrong-keyed tool-span path was removed.
 *
 * Public so the client can call it directly. Guarded on three fronts so one
 * browser cannot pollute or spoof another call's trace: the call must exist, the
 * caller must own it (its sessionId must match), and every span must be keyed to
 * that call's id (the report's trace key). Upserts by (traceId, spanId) — via the
 * by_trace_span index — so the periodic + final flush are idempotent and cheap.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { traceSpanValidator } from "./_contracts";

export const batchWriteSpans = mutation({
  args: { callId: v.id("calls"), sessionId: v.string(), spans: v.array(traceSpanValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Guard: unknown call or a caller that doesn't own it → drop silently.
    const call = await ctx.db.get(args.callId);
    if (!call || call.sessionId !== args.sessionId) return null;

    // One query up front instead of N+1 .unique() lookups — the client
    // re-flushes the full span list every ~5s, so the per-span index hit was
    // O(spans) per flush. Build a map by spanId for O(1) lookup in the loop.
    const existingSpans = await ctx.db
      .query("spans")
      .withIndex("by_trace_span", (q) => q.eq("traceId", args.callId))
      .collect();
    const bySpanId = new Map(existingSpans.map((s) => [s.spanId, s._id]));

    for (const span of args.spans) {
      // Reject any span not keyed to this call — no cross-trace contamination.
      if (span.traceId !== args.callId) continue;
      const fields = {
        traceId: span.traceId,
        spanId: span.spanId,
        parentId: span.parentId,
        kind: span.kind,
        label: span.label,
        startMs: span.startMs,
        endMs: span.endMs,
        durationMs: span.durationMs,
        attrs: span.attrs,
      };
      // Upsert by (traceId, spanId): the client re-flushes already-seen spans on
      // each tick; without this, every flush would duplicate them, and a span
      // whose window grew (assistant kept speaking) would never update.
      const prevId = bySpanId.get(span.spanId);
      if (prevId) {
        await ctx.db.patch(prevId, fields);
      } else {
        await ctx.db.insert("spans", fields);
      }
    }
    return null;
  },
});
