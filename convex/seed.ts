/**
 * FROZEN DAY-0 CONTRACT — convex/seed.ts
 *
 * Idempotent deterministic seed for the read-surfaces (leaderboard, recent
 * calls, analytics, budget). Produces rows equivalent to lib/data/mock.ts so
 * the UI renders comparable data the moment the deployment goes live.
 *
 * RULES:
 *   - Deterministic only. NO Date.now()/Math.random() — timestamps derive from
 *     the fixed BASE_EPOCH constant so two runs produce identical data.
 *   - Safe to run twice: clear-then-insert per seeded table.
 *   - internalMutation; object syntax; args {} and returns v.null().
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

    // ── 2. providerStats (mirror MOCK_PROVIDER_STATS) ─────────────────────────────
    const providerStats = [
      { provider: "Deepgram Flux", kind: "stt", source: "native", p50LatencyMs: 240, p95LatencyMs: 410, costPerMin: 0.006, avgRating: 4.6, callCount: 318, languages: ["en", "es"] },
      { provider: "AssemblyAI", kind: "stt", source: "native", p50LatencyMs: 380, p95LatencyMs: 620, costPerMin: 0.007, avgRating: 4.3, callCount: 142, languages: ["en"] },
      { provider: "Fal.ai Whisper", kind: "stt", source: "custom", p50LatencyMs: 520, p95LatencyMs: 880, costPerMin: 0.004, avgRating: 4.1, callCount: 64, languages: ["en", "es", "fr"] },
      { provider: "Cartesia Sonic-3", kind: "tts", source: "native", voice: "Sonic", p50LatencyMs: 290, p95LatencyMs: 520, costPerMin: 0.02, avgRating: 4.7, callCount: 271, languages: ["en", "es"] },
      { provider: "ElevenLabs", kind: "tts", source: "native", voice: "Rachel", p50LatencyMs: 640, p95LatencyMs: 980, costPerMin: 0.05, avgRating: 4.8, callCount: 188, languages: ["en"] },
      { provider: "Fal.ai Kokoro-82M", kind: "tts", source: "custom", voice: "Kokoro", p50LatencyMs: 720, p95LatencyMs: 1180, costPerMin: 0.003, avgRating: 4.0, callCount: 52, languages: ["en"] },
      { provider: "GPT-4o mini", kind: "llm", source: "native", p50LatencyMs: 450, p95LatencyMs: 760, costPerMin: 0.015, avgRating: 4.5, callCount: 402, languages: ["en", "es", "fr"] },
      { provider: "Groq Llama-3.3", kind: "llm", source: "native", p50LatencyMs: 210, p95LatencyMs: 390, costPerMin: 0.008, avgRating: 4.2, callCount: 156, languages: ["en"] },
    ] as const;

    for (const s of providerStats) {
      await ctx.db.insert("providerStats", {
        provider: s.provider,
        kind: s.kind,
        source: s.source,
        voice: "voice" in s ? (s as { voice?: string }).voice : undefined,
        p50LatencyMs: s.p50LatencyMs,
        p95LatencyMs: s.p95LatencyMs,
        costPerMin: s.costPerMin,
        avgRating: s.avgRating,
        callCount: s.callCount,
        languages: [...s.languages],
      });
    }

    // ── 3. Recent calls (mirror MOCK_RECENT_CALLS, 12 rows) ────────────────────────
    // Same deterministic formulas as lib/data/mock.ts, with startedAt resolved
    // against BASE_EPOCH instead of render-time `now`.
    const BUSINESSES = ["Glow Dental", "Lux Salon", "Hale & Park Law", "Bright Smiles", "Urban Cuts"];
    const OUTCOMES = ["booked", "intent", "abandoned"] as const;
    const STTS = ["Deepgram Flux", "AssemblyAI", "Fal.ai Whisper"];
    const TTSS = ["Cartesia Sonic-3", "ElevenLabs", "Fal.ai Kokoro-82M"];
    const TTS_VOICES: Record<string, string | undefined> = {
      "Cartesia Sonic-3": "Sonic",
      ElevenLabs: "Rachel",
      "Fal.ai Kokoro-82M": "Kokoro",
    };
    const TTFW = [320, 540, 880, 1240];

    // Calls reference a real businessId when the name is a known preset; the two
    // non-preset demo names (Bright Smiles, Urban Cuts) fall back to Glow Dental
    // so the FK is always valid (judgment call — see summary).
    const fallbackBusinessId = businessIds["Glow Dental"];

    for (let i = 0; i < 12; i++) {
      const outcome = OUTCOMES[i % 3];
      const businessName = BUSINESSES[i % BUSINESSES.length];
      const stt = STTS[i % 3];
      const tts = TTSS[i % 3];
      const ttfw = TTFW[i % 4];
      const startedAt = BASE_EPOCH - (i * 7 + 2) * 60_000; // "N minutes ago"
      const durationSec = 45 + ((i * 17) % 70);
      const businessId = businessIds[businessName] ?? fallbackBusinessId;

      await ctx.db.insert("calls", {
        sessionId: `seed_session_${(i + 1).toString().padStart(4, "0")}`,
        businessId,
        businessName,
        vapiCallId: `seed_vapi_${(i + 1).toString().padStart(4, "0")}`,
        status: "ended",
        outcome,
        startedAt,
        endedAt: startedAt + durationSec * 1000,
        durationSec,
        costUsd: 0.18 + (i % 5) * 0.04,
        costBreakdown: { stt: 0.04, llm: 0.06, tts: 0.07, platform: 0.03 },
        sttProvider: stt,
        ttsProvider: tts,
        ttsVoice: TTS_VOICES[tts],
        llmProvider: i % 2 === 0 ? "GPT-4o mini" : "Groq Llama-3.3",
        languages: i % 4 === 0 ? ["en", "es"] : ["en"],
        ttfwMs: ttfw,
        successEval: outcome === "booked",
        visitorKey: `seed_visitor_${i % 5}`,
      });
    }

    // ── 4. budgetState singleton (mirror MOCK_BUDGET spend + active calls) ─────────
    await ctx.db.insert("budgetState", {
      totalSpentUsd: 12.4,
      daySpentUsd: 2.4,
      day: "2026-06-16",
      activeCalls: 0,
    });

    return null;
  },
});
