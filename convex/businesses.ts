/**
 * Wave A — business reads. The frontend matches a selected preset (by name) to its
 * Convex business `_id` to start a call.
 */
import { query } from "./_generated/server";
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
