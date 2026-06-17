import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const rate = mutation({
  args: {
    callId: v.id("calls"),
    stars: v.number(),
    ttsProvider: v.string(),
    ttsVoice: v.optional(v.string()),
    visitorKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Overwrite prior rating from the same visitor on the same call.
    const existing = await ctx.db
      .query("voiceRatings")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    const prior = existing.find((r) => r.visitorKey === args.visitorKey);
    if (prior) {
      await ctx.db.patch(prior._id, { stars: args.stars });
    } else {
      await ctx.db.insert("voiceRatings", {
        callId: args.callId,
        ttsProvider: args.ttsProvider,
        ttsVoice: args.ttsVoice,
        stars: args.stars,
        visitorKey: args.visitorKey,
      });
    }
    return null;
  },
});
