import { mutation } from "./_generated/server";
import { v } from "convex/values";

const PRESET_DEFINITIONS = [
  {
    name: "Glow Dental",
    profile: {
      companyName: "Glow Dental",
      hours: "Mon–Fri 8:00–17:00, Sat 9:00–13:00",
      services: ["Cleaning", "Whitening", "Checkup", "Crowns", "Emergency"],
      policies: [
        "24h cancellation notice required",
        "New patients fill intake before first visit",
        "We accept most PPO insurance",
      ],
      availability: "Next available: weekday mornings",
    },
    chunks: [
      { text: "We're open Monday to Friday 8am–5pm and Saturday 9am–1pm.", tags: ["hours"] },
      { text: "Cancellations require 24 hours notice or a fee may apply.", tags: ["policy", "cancellation"] },
      { text: "We offer cleanings, whitening, checkups, crowns, and emergency visits.", tags: ["services"] },
      { text: "We accept most PPO dental insurance plans.", tags: ["policy", "insurance"] },
    ],
  },
  {
    name: "Lux Salon",
    profile: {
      companyName: "Lux Salon",
      hours: "Tue–Sat 10:00–19:00",
      services: ["Cut", "Color", "Balayage", "Blowout", "Treatment"],
      policies: [
        "Late >15 min may be rescheduled",
        "Color services require a consultation",
        "Deposit held for appointments over 2 hours",
      ],
      availability: "Next available: this week afternoons",
    },
    chunks: [
      { text: "We're open Tuesday to Saturday from 10am to 7pm.", tags: ["hours"] },
      { text: "Color services require a quick consultation first.", tags: ["policy", "color"] },
      { text: "Services include cuts, color, balayage, blowouts, and treatments.", tags: ["services"] },
      { text: "Arriving more than 15 minutes late may require rescheduling.", tags: ["policy", "late"] },
    ],
  },
  {
    name: "Hale & Park Law",
    profile: {
      companyName: "Hale & Park Law",
      hours: "Mon–Fri 9:00–18:00",
      services: ["Consultation", "Estate planning", "Business formation", "Contracts"],
      policies: [
        "Initial consultation is 30 minutes",
        "Conflict check before engagement",
        "Communications are confidential",
      ],
      availability: "Next available: by appointment",
    },
    chunks: [
      { text: "Our office hours are Monday to Friday, 9am to 6pm.", tags: ["hours"] },
      { text: "Initial consultations are 30 minutes.", tags: ["services", "consultation"] },
      { text: "We handle estate planning, business formation, and contracts.", tags: ["services"] },
      { text: "All communications with the firm are confidential.", tags: ["policy", "confidential"] },
    ],
  },
] as const;

export const ensurePresets = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const budget = await ctx.db.query("budgetState").first();
    if (!budget) {
      await ctx.db.insert("budgetState", {
        totalSpentUsd: 0,
        daySpentUsd: 0,
        day: new Date().toISOString().slice(0, 10),
        activeCalls: 0,
      });
    }

    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_kind", (q) => q.eq("kind", "preset"))
      .collect();
    const existingNames = new Set(existing.map((b) => b.name));

    for (const def of PRESET_DEFINITIONS) {
      if (existingNames.has(def.name)) continue;
      const businessId = await ctx.db.insert("businesses", {
        kind: "preset",
        name: def.name,
        profile: {
          ...def.profile,
          services: [...def.profile.services],
          policies: [...def.profile.policies],
        },
        chunkCount: def.chunks.length,
        createdAt: Date.now(),
      });
      for (const chunk of def.chunks) {
        await ctx.db.insert("knowledgeChunks", {
          businessId,
          text: chunk.text,
          tags: [...chunk.tags],
        });
      }
    }

    return null;
  },
});
