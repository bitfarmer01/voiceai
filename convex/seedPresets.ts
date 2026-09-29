import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { seedCalendar } from "./calendar";

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
  {
    name: "Affordable Health Insurance of Central Florida",
    profile: {
      companyName: "Affordable Health Insurance of Central Florida",
      hours: "Mon–Fri 9:00–17:00",
      services: ["Medicare", "Health insurance", "Life insurance", "Small business plans"],
      policies: [
        "Consultations are free — paid by carriers",
        "No plan advice or premium quotes by phone",
        "Serving Orlando and Central Florida",
      ],
      availability: "Next available: weekdays",
    },
    chunks: [
      { text: "We're open Monday to Friday, 9am to 5pm.", tags: ["hours"] },
      { text: "Consultations are always free — Samuel is paid by the insurance carriers, never by you.", tags: ["policy", "pricing"] },
      { text: "We help with Medicare, ACA Marketplace health plans, life insurance, and small business coverage.", tags: ["services"] },
      { text: "Medicare Annual Enrollment runs October 15 to December 7; ACA Open Enrollment runs November 1 to January 15.", tags: ["policy", "enrollment"] },
      { text: "For every service, the next step is a free consultation with Samuel, where he reviews your options, costs, and coverage.", tags: ["services", "consultation"] },
      { text: "You don't need to know which plan or type of policy you want before booking — Samuel explains the options at the consultation.", tags: ["services", "consultation"] },
      { text: "Samuel Gordon is a licensed Florida insurance agent with over 14 years of experience, and compares plans from many Florida carriers.", tags: ["about", "agent"] },
      { text: "Most clients are quoted the same day.", tags: ["pricing", "quotes"] },
      { text: "We serve Orlando, Kissimmee, Sanford, Deltona, The Villages, Winter Park, Daytona Beach, Ocala, Lakeland, and Altamonte Springs.", tags: ["location", "service-area"] },
      { text: "The receptionist can't give plan advice, quote premiums, or confirm whether a doctor or prescription is covered — Samuel reviews all of that at the free consultation.", tags: ["policy", "pricing"] },
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
    const existingByName = new Map(existing.map((b) => [b.name, b]));

    for (const def of PRESET_DEFINITIONS) {
      const found = existingByName.get(def.name);
      if (found) {
        // Top up chunks added to the definition after this preset was seeded;
        // never duplicates or removes existing ones.
        const stored = await ctx.db
          .query("knowledgeChunks")
          .withIndex("by_business", (q) => q.eq("businessId", found._id))
          .collect();
        const have = new Set(stored.map((c) => c.text));
        const missing = def.chunks.filter((c) => !have.has(c.text));
        for (const chunk of missing) {
          await ctx.db.insert("knowledgeChunks", {
            businessId: found._id,
            text: chunk.text,
            tags: [...chunk.tags],
          });
        }
        if (missing.length > 0) {
          await ctx.db.patch(found._id, { chunkCount: stored.length + missing.length });
        }
        continue;
      }
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
      await seedCalendar(ctx, businessId, Date.now());
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
