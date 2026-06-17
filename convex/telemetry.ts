/**
 * Wave A — Telemetry off the critical path (plan.md §5.3).
 *
 * `batchWriteSpans` is the fire-and-forget sink the client (and our own
 * tool endpoints) flush OTel spans into. The live view renders from local
 * React state; spans are written here in batches (~500ms / on call end), so
 * this is NEVER on the audio render path.
 *
 * Public so the Vapi Web SDK client can call it directly; it only writes
 * append-only span rows, so exposing it is low-risk.
 */
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { traceSpanValidator } from "./_contracts";

export const batchWriteSpans = mutation({
  args: { spans: v.array(traceSpanValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bulk insert. Spans are small and append-only; one batch stays well under
    // the per-mutation write ceiling. If a caller ever sends a huge batch the
    // client should chunk it (the flush cadence keeps batches small in practice).
    for (const span of args.spans) {
      await ctx.db.insert("spans", {
        traceId: span.traceId,
        spanId: span.spanId,
        parentId: span.parentId,
        kind: span.kind,
        label: span.label,
        startMs: span.startMs,
        endMs: span.endMs,
        durationMs: span.durationMs,
        attrs: span.attrs,
      });
    }
    return null;
  },
});

/**
 * Single-span sink the tool httpActions schedule (fire-and-forget) so they can
 * "respond first, log after" without exposing a public mutation to VAPI.
 */
export const writeSpanInternal = internalMutation({
  args: { span: traceSpanValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = args.span;
    await ctx.db.insert("spans", {
      traceId: s.traceId,
      spanId: s.spanId,
      parentId: s.parentId,
      kind: s.kind,
      label: s.label,
      startMs: s.startMs,
      endMs: s.endMs,
      durationMs: s.durationMs,
      attrs: s.attrs,
    });
    return null;
  },
});
