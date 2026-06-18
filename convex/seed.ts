/**
 * REAL-DATA-ONLY SEED — convex/seed.ts
 *
 * Seeds ONLY the preset sample businesses a visitor can talk to (real product
 * content) plus their knowledge chunks, and a zeroed budget singleton. It NEVER
 * writes fabricated calls, providerStats rollups, or non-zero budget spend —
 * every number the UI shows must come from real, live calls.
 *
 * RULES:
 *   - Deterministic only. NO Date.now()/Math.random() — timestamps derive from
 *     the fixed BASE_EPOCH constant so two runs produce identical data.
 *   - Safe to run twice: clear-then-insert per seeded table.
 *   - internalMutation; object syntax; args {} and returns v.null().
 *
 * NOTE: re-running this clears `calls`, `providerStats`, and `budgetState`,
 * which is destructive to any REAL call data already recorded. Only run on a
 * fresh deployment, or when you intentionally want a clean slate.
 */
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// Fixed reference epoch so timestamps are stable across runs.
// 2026-06-16T12:00:00.000Z (matches the project's "today" without reading the clock).
const BASE_EPOCH = 1781611200000;

export const seed = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // ── 0. Clear seeded tables (clear-then-insert → safe to re-run) ───────────────
    // Only the tables this seed populates. `calls` and `providerStats` are cleared
    // so a re-seed never leaves orphaned/fabricated rows — they start empty and
    // fill exclusively from real calls. budgetState is reset to a zeroed singleton.
    for (const table of [
      "businesses",
      "knowledgeChunks",
      "providerStats",
      "calls",
      "budgetState",
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
      }
    }

    // ── 1. Preset businesses ──────────────────────────────────────────────────────
    // Real product content: the sample businesses a visitor talks to.
    const presets = [
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
      },
      {
        name: "Hale & Park Law",
        profile: {
          companyName: "Hale & Park Law",
          hours: "Mon–Fri 9:00–18:00",
          services: [
            "Consultation",
            "Estate planning",
            "Business formation",
            "Contracts",
          ],
          policies: [
            "Initial consultation is 30 minutes",
            "Conflict check before engagement",
            "Communications are confidential",
          ],
          availability: "Next available: by appointment",
        },
      },
    ];

    const businessIds: Record<string, Id<"businesses">> = {};

    // Insert businesses and a few knowledge chunks each.
    const chunkSets: Record<string, { text: string; tags: string[] }[]> = {
      "Glow Dental": [
        { text: "We're open Monday to Friday 8am–5pm and Saturday 9am–1pm.", tags: ["hours"] },
        { text: "Cancellations require 24 hours notice or a fee may apply.", tags: ["policy", "cancellation"] },
        { text: "We offer cleanings, whitening, checkups, crowns, and emergency visits.", tags: ["services"] },
        { text: "We accept most PPO dental insurance plans.", tags: ["policy", "insurance"] },
      ],
      "Lux Salon": [
        { text: "We're open Tuesday to Saturday from 10am to 7pm.", tags: ["hours"] },
        { text: "Color services require a quick consultation first.", tags: ["policy", "color"] },
        { text: "Services include cuts, color, balayage, blowouts, and treatments.", tags: ["services"] },
        { text: "Arriving more than 15 minutes late may require rescheduling.", tags: ["policy", "late"] },
      ],
      "Hale & Park Law": [
        { text: "Our office hours are Monday to Friday, 9am to 6pm.", tags: ["hours"] },
        { text: "Initial consultations are 30 minutes.", tags: ["services", "consultation"] },
        { text: "We handle estate planning, business formation, and contracts.", tags: ["services"] },
        { text: "All communications with the firm are confidential.", tags: ["policy", "confidential"] },
      ],
    };

    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const businessId = await ctx.db.insert("businesses", {
        kind: "preset",
        name: p.name,
        profile: p.profile,
        chunkCount: chunkSets[p.name].length,
        createdAt: BASE_EPOCH,
      });
      businessIds[p.name] = businessId;
      for (const chunk of chunkSets[p.name]) {
        await ctx.db.insert("knowledgeChunks", {
          businessId,
          text: chunk.text,
          tags: chunk.tags,
        });
      }
    }

    // ── 2. providerStats: intentionally empty ─────────────────────────────────────
    // No fabricated rollups. The leaderboard fills from real calls as they happen.

    // ── 3. calls: intentionally empty ─────────────────────────────────────────────
    // No demo/fake call history. Recent-calls, analytics, and leaderboard surfaces
    // render honest empty/loading states until real calls are recorded.

    // ── 4. budgetState singleton (zeroed — no fabricated spend) ───────────────────
    await ctx.db.insert("budgetState", {
      totalSpentUsd: 0,
      daySpentUsd: 0,
      day: "2026-06-16",
      activeCalls: 0,
    });

    return null;
  },
});
