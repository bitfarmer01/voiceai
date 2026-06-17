import { query } from "./_generated/server";
import { v } from "convex/values";
import { traceSpanValidator } from "./_contracts";

export const listByTrace = query({
  args: { traceId: v.string() },
  returns: v.array(traceSpanValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("spans")
      .withIndex("by_trace", (q) => q.eq("traceId", args.traceId))
      .order("asc")
      .collect();
    // Map to the clean TraceSpan shape — the return validator (and the
    // waterfall renderer) expect no system fields.
    return rows.map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentId: s.parentId,
      kind: s.kind,
      label: s.label,
      startMs: s.startMs,
      endMs: s.endMs,
      durationMs: s.durationMs,
      attrs: s.attrs,
    }));
  },
});
