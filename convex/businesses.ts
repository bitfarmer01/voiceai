/**
 * Wave A — business reads. The frontend matches a selected preset (by name) to its
 * Convex business `_id` to start a call.
 */
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

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

/**
 * Read a configured (or any slug-bearing) business plus its knowledge chunks.
 * Same projection shape as getWithChunks, so the result drops straight into
 * ConvexBusinessForAssistant. Returns null when no business carries the slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
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
    const slug = args.slug.trim().toLowerCase();
    const biz = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!biz) return null;
    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_business", (q) => q.eq("businessId", biz._id))
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

/**
 * Insert or overwrite a configured business at `slug`. Permanent (no expiresAt).
 * On overwrite, the prior business at that slug is reused and its knowledge chunks
 * are deleted before the new ones are inserted (no duplicates). Only configured
 * businesses carry a slug, so a slug hit is always a prior configured row.
 * The profile is already sanitized upstream by generateDraftProfile; this mutation
 * stores it as-is (V8 mutation — the node-only sanitizeProfile is not importable here).
 */
export const upsertConfigured = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    profile: v.object({
      companyName: v.string(),
      hours: v.string(),
      services: v.array(v.string()),
      policies: v.array(v.string()),
      availability: v.string(),
    }),
    chunks: v.array(v.object({ text: v.string(), tags: v.array(v.string()) })),
  },
  returns: v.id("businesses"),
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    let businessId: Id<"businesses">;
    if (existing) {
      const oldChunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_business", (q) => q.eq("businessId", existing._id))
        .collect();
      for (const c of oldChunks) await ctx.db.delete(c._id);

      await ctx.db.patch(existing._id, {
        kind: "configured",
        name: args.name,
        profile: args.profile,
        chunkCount: args.chunks.length,
      });
      businessId = existing._id;
    } else {
      businessId = await ctx.db.insert("businesses", {
        kind: "configured",
        slug,
        name: args.name,
        profile: args.profile,
        chunkCount: args.chunks.length,
        createdAt: Date.now(),
      });
    }

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
