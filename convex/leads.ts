import { query } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { leadId: v.id("leads") },
  returns: v.union(
    v.null(),
    v.object({
      contact: v.string(),
      request: v.string(),
      businessName: v.string(),
      createdAt: v.number(),
      slot: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;
    const [biz, call] = await Promise.all([
      ctx.db.get(lead.businessId),
      ctx.db.get(lead.callId),
    ]);
    const sd = call?.structuredData as { booking?: { slot?: string } } | undefined;
    return {
      contact: lead.contact,
      request: lead.request,
      businessName: biz?.name ?? "Business",
      createdAt: lead.createdAt,
      slot: sd?.booking?.slot,
    };
  },
});
