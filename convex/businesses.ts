/**
 * Wave A — business reads. The frontend matches a selected preset (by name) to its
 * Convex business `_id` to start a call.
 */
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const listPresets = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("businesses"),
      name: v.string(),
      chunkCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("businesses")
      .withIndex("by_kind", (q) => q.eq("kind", "preset"))
      .collect();
    return rows.map((r) => ({ _id: r._id, name: r.name, chunkCount: r.chunkCount ?? 0 }));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getWithChunks = query({
  args: { businessId: v.id("businesses") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("businesses"),
      name: v.string(),
      profile: v.object({
        companyName: v.string(),
        hours: v.string(),
        services: v.array(v.string()),
        policies: v.array(v.string()),
        availability: v.string(),
      }),
      chunks: v.array(v.object({ text: v.string(), tags: v.array(v.string()) })),
    }),
  ),
  handler: async (ctx, args) => {
    const biz = await ctx.db.get(args.businessId);
    if (!biz) return null;
    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect();
    return {
      _id: biz._id,
      name: biz.name,
      profile: {
        companyName: biz.profile.companyName,
        hours: biz.profile.hours,
        services: biz.profile.services,
        policies: biz.profile.policies,
        availability: biz.profile.availability,
      },
      chunks: chunks.map((c) => ({ text: c.text, tags: c.tags })),
    };
  },
});

export const insertUploadedBusiness = internalMutation({
  args: {
    sessionId: v.string(),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    companyName: v.string(),
    hours: v.string(),
    services: v.array(v.string()),
    policies: v.array(v.string()),
    availability: v.string(),
    chunks: v.array(v.object({ text: v.string(), tags: v.array(v.string()) })),
  },
  returns: v.id("businesses"),
  handler: async (ctx, args) => {
    const businessId = await ctx.db.insert("businesses", {
      kind: "upload",
      sessionId: args.sessionId,
      name: args.companyName,
      profile: {
        companyName: args.companyName,
        hours: args.hours,
        services: args.services,
        policies: args.policies,
        availability: args.availability,
      },
      sourceMeta: args.storageId
        ? { storageId: args.storageId, fileName: args.fileName!, mimeType: args.mimeType! }
        : undefined,
      chunkCount: args.chunks.length,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    for (const chunk of args.chunks) {
      await ctx.db.insert("knowledgeChunks", {
        businessId,
        text: chunk.text,
        tags: chunk.tags,
      });
    }
    return businessId;
  },
});
