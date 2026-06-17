/**
 * Wave A — Selectable provider registry (plan.md §7).
 *
 * The mix-and-match STT / TTS / LLM options the "Voice Pipeline" selector
 * renders. This is the SELECTABLE list (what you can choose before a call),
 * distinct from `providerStats` (the measured rollup from real calls).
 *
 * Shape mirrors lib/types.ts `Provider`:
 *   { id, name, kind, source, voice?, costPerMin, languages }
 *
 * costPerMin values are kept in lock-step with the seeded providerStats so the
 * UI shows a consistent price whether it reads the registry or the rollup.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";

const providerKindValidator = v.union(
  v.literal("stt"),
  v.literal("tts"),
  v.literal("llm"),
);
const providerSourceValidator = v.union(
  v.literal("native"),
  v.literal("custom"),
);

const providerValidator = v.object({
  id: v.string(),
  name: v.string(),
  kind: providerKindValidator,
  source: providerSourceValidator,
  voice: v.optional(v.string()),
  costPerMin: v.number(),
  languages: v.array(v.string()),
});

/**
 * The frozen registry. Covers the providers the UI lets you mix and match:
 *   STT — Deepgram Flux (native), AssemblyAI (native), Fal.ai Whisper (custom)
 *   TTS — Cartesia Sonic-3 (native), ElevenLabs (native), Fal.ai Kokoro-82M (custom)
 *   LLM — GPT-4o mini (native), Groq Llama-3.3 (native)
 */
const REGISTRY = [
  // ── STT ──────────────────────────────────────────────────────────────────────
  {
    id: "stt_deepgram_flux",
    name: "Deepgram Flux",
    kind: "stt" as const,
    source: "native" as const,
    costPerMin: 0.006,
    languages: ["en", "es"],
  },
  {
    id: "stt_assemblyai",
    name: "AssemblyAI",
    kind: "stt" as const,
    source: "native" as const,
    costPerMin: 0.007,
    languages: ["en"],
  },
  {
    id: "stt_fal_whisper",
    name: "Fal.ai Whisper",
    kind: "stt" as const,
    source: "custom" as const,
    costPerMin: 0.004,
    languages: ["en", "es", "fr"],
  },
  // ── TTS ──────────────────────────────────────────────────────────────────────
  {
    id: "tts_cartesia_sonic3",
    name: "Cartesia Sonic-3",
    kind: "tts" as const,
    source: "native" as const,
    voice: "Sonic",
    costPerMin: 0.02,
    languages: ["en", "es"],
  },
  {
    id: "tts_elevenlabs",
    name: "ElevenLabs",
    kind: "tts" as const,
    source: "native" as const,
    voice: "Rachel",
    costPerMin: 0.05,
    languages: ["en"],
  },
  {
    id: "tts_fal_kokoro",
    name: "Fal.ai Kokoro-82M",
    kind: "tts" as const,
    source: "custom" as const,
    voice: "Kokoro",
    costPerMin: 0.003,
    languages: ["en"],
  },
  // ── LLM ──────────────────────────────────────────────────────────────────────
  {
    id: "llm_gpt4o_mini",
    name: "GPT-4o mini",
    kind: "llm" as const,
    source: "native" as const,
    costPerMin: 0.015,
    languages: ["en", "es", "fr"],
  },
  {
    id: "llm_groq_llama33",
    name: "Groq Llama-3.3",
    kind: "llm" as const,
    source: "native" as const,
    costPerMin: 0.008,
    languages: ["en"],
  },
];

export const listRegistry = query({
  args: {
    kind: v.optional(providerKindValidator),
  },
  returns: v.array(providerValidator),
  handler: async (_ctx, args) => {
    if (args.kind) {
      return REGISTRY.filter((p) => p.kind === args.kind);
    }
    return REGISTRY;
  },
});
