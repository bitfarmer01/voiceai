import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Public queries over the knowledgeChunks table.
 * Used by the /try reference panel to show all source chunks for the current
 * business and highlight which ones the receptionist drew from mid-call.
 */

export const listForBusiness = query({
  args: { businessId: v.id("businesses") },
  returns: v.array(
    v.object({
      _id: v.id("knowledgeChunks"),
      text: v.string(),
      tags: v.array(v.string()),
    }),
  ),
  handler: async (ctx, { businessId }) => {
    const rows = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_business", (q) => q.eq("businessId", businessId))
      .collect();
    return rows.map((r) => ({ _id: r._id, text: r.text, tags: r.tags }));
  },
});
