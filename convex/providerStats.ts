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
    const rows = args.kind
      ? await ctx.db
          .query("providerStats")
          .withIndex("by_kind", (q) => q.eq("kind", args.kind!))
          .collect()
      : await ctx.db.query("providerStats").collect();
    // Map to the clean ProviderStat shape — raw docs carry _id/_creationTime,
    // which the returns validator (rightly) rejects.
    return rows.map((r) => ({
      provider: r.provider,
      kind: r.kind,
      source: r.source,
      voice: r.voice,
      p50LatencyMs: r.p50LatencyMs,
      p95LatencyMs: r.p95LatencyMs,
      costPerMin: r.costPerMin,
      avgRating: r.avgRating,
      callCount: r.callCount,
      languages: r.languages,
    }));
  },
});
