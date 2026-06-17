import { mutation, query } from "./_generated/server";
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
    const rows = await ctx.db
      .query("transcriptTurns")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
    // Map to the clean TranscriptTurn shape (the return validator — and the
    // report UI — expect no system fields).
    return rows.map((t) => ({
      idx: t.idx,
      role: t.role,
      text: t.text,
      ts: t.ts,
      interim: t.interim,
      confidence: t.confidence,
    }));
  },
});

/**
 * Phase 3 — persist finalized transcript turns from the live call (the Web SDK
 * client is the only place the turn-by-turn transcript exists). Public so the
 * client can flush directly. Upserts by (callId, idx) so the periodic + final
 * flush never duplicate a turn, and a later flush can correct an earlier text.
 * Drops silently if the call row is gone, or if the caller's sessionId doesn't
 * own the call (no writing turns onto someone else's call).
 */
export const recordTurns = mutation({
  args: {
    callId: v.id("calls"),
    sessionId: v.string(),
    turns: v.array(
      v.object({
        idx: v.number(),
        role: turnRoleValidator,
        text: v.string(),
        ts: v.number(),
        confidence: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.sessionId !== args.sessionId) return null;

    const existing = await ctx.db
      .query("transcriptTurns")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    const byIdx = new Map(existing.map((t) => [t.idx, t._id]));

    for (const turn of args.turns) {
      const prevId = byIdx.get(turn.idx);
      const fields = {
        callId: args.callId,
        idx: turn.idx,
        role: turn.role,
        text: turn.text,
        ts: turn.ts,
        interim: false,
        confidence: turn.confidence,
      };
      if (prevId) {
        await ctx.db.patch(prevId, fields);
      } else {
        await ctx.db.insert("transcriptTurns", fields);
      }
    }
    return null;
  },
});
