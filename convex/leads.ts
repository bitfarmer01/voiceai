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
    }),
  ),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;
    const biz = await ctx.db.get(lead.businessId);
    return {
      contact: lead.contact,
      request: lead.request,
      businessName: biz?.name ?? "Business",
      createdAt: lead.createdAt,
    };
  },
});
