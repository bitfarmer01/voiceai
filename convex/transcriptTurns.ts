import { query } from "./_generated/server";
import { v } from "convex/values";

const turnRoleValidator = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
);

const transcriptTurnValidator = v.object({
  idx: v.number(),
  role: turnRoleValidator,
  text: v.string(),
  ts: v.number(),
  interim: v.optional(v.boolean()),
  confidence: v.optional(v.number()),
});

export const listByCall = query({
  args: { callId: v.id("calls") },
  returns: v.array(transcriptTurnValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptTurns")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
  },
});
