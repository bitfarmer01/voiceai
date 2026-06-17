import { query } from "./_generated/server";
import { v } from "convex/values";
import { traceSpanValidator } from "./_contracts";

export const listByTrace = query({
  args: { traceId: v.string() },
  returns: v.array(traceSpanValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("spans")
      .withIndex("by_trace", (q) => q.eq("traceId", args.traceId))
      .order("asc")
      .collect();
  },
});
