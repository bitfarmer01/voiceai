import { query } from "./_generated/server";
import { v } from "convex/values";

const providerKind = v.union(
  v.literal("stt"),
  v.literal("tts"),
  v.literal("llm"),
);

const providerStatValidator = v.object({
  provider: v.string(),
  kind: providerKind,
  source: v.union(v.literal("native"), v.literal("custom")),
  voice: v.optional(v.string()),
  p50LatencyMs: v.number(),
  p95LatencyMs: v.number(),
  costPerMin: v.number(),
  avgRating: v.number(),
  callCount: v.number(),
  languages: v.array(v.string()),
});

export const list = query({
  args: { kind: v.optional(providerKind) },
  returns: v.array(providerStatValidator),
  handler: async (ctx, args) => {
    if (args.kind) {
      return await ctx.db
        .query("providerStats")
        .withIndex("by_kind", (q) => q.eq("kind", args.kind!))
        .collect();
    }
    return await ctx.db.query("providerStats").collect();
  },
});
