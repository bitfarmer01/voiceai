/**
 * Small, deterministic DEMO fixtures backing the data seam (lib/data/index.ts).
 * These are illustrative placeholders — NOT measured usage — surfaced behind a
 * "Demo data" label until real calls populate the Convex queries. The UI imports
 * the hooks, never these fixtures directly.
 */
import type {
  CallSummary,
  Provider,
  ProviderStat,
} from "@/lib/types";

export const MOCK_PROVIDERS: Provider[] = [
  { id: "deepgram-flux", name: "Deepgram Flux", kind: "stt", source: "native", costPerMin: 0.006, languages: ["en", "es"] },
  { id: "assemblyai", name: "AssemblyAI", kind: "stt", source: "native", costPerMin: 0.007, languages: ["en"] },
  { id: "fal-whisper", name: "Fal.ai Whisper", kind: "stt", source: "custom", costPerMin: 0.004, languages: ["en", "es", "fr"] },
  { id: "vapi-elliot", name: "VAPI · Elliot", kind: "tts", source: "native", voice: "Elliot", costPerMin: 0.01, languages: ["en"] },
  { id: "cartesia-sonic3", name: "Cartesia Sonic-3", kind: "tts", source: "native", voice: "Sonic", costPerMin: 0.02, languages: ["en", "es"] },
  { id: "elevenlabs", name: "ElevenLabs", kind: "tts", source: "native", voice: "Rachel", costPerMin: 0.05, languages: ["en"] },
  { id: "fal-kokoro", name: "Fal.ai Kokoro-82M", kind: "tts", source: "custom", voice: "Kokoro", costPerMin: 0.003, languages: ["en"] },
  { id: "gpt-4o-mini", name: "GPT-4o mini", kind: "llm", source: "native", costPerMin: 0.015, languages: ["en", "es", "fr"] },
  { id: "groq-llama", name: "Groq Llama-3.3", kind: "llm", source: "native", costPerMin: 0.008, languages: ["en"] },
];

// callCount mirrors the 3 demo calls below (each call uses 1 STT + 1 TTS + 1 LLM)
// — small, illustrative numbers, not measured traffic. p50/p95/cost are reference
// provider profiles; avgRating is a modest demo value shown behind the "Demo data" label.
export const MOCK_PROVIDER_STATS: ProviderStat[] = [
  { provider: "Deepgram Flux", kind: "stt", source: "native", p50LatencyMs: 240, p95LatencyMs: 410, costPerMin: 0.006, avgRating: 4.6, callCount: 1, languages: ["en", "es"] },
  { provider: "AssemblyAI", kind: "stt", source: "native", p50LatencyMs: 380, p95LatencyMs: 620, costPerMin: 0.007, avgRating: 4.3, callCount: 1, languages: ["en"] },
  { provider: "Fal.ai Whisper", kind: "stt", source: "custom", p50LatencyMs: 520, p95LatencyMs: 880, costPerMin: 0.004, avgRating: 4.1, callCount: 1, languages: ["en", "es", "fr"] },
  { provider: "Cartesia Sonic-3", kind: "tts", source: "native", voice: "Sonic", p50LatencyMs: 290, p95LatencyMs: 520, costPerMin: 0.02, avgRating: 4.7, callCount: 1, languages: ["en", "es"] },
  { provider: "ElevenLabs", kind: "tts", source: "native", voice: "Rachel", p50LatencyMs: 640, p95LatencyMs: 980, costPerMin: 0.05, avgRating: 4.8, callCount: 1, languages: ["en"] },
  { provider: "Fal.ai Kokoro-82M", kind: "tts", source: "custom", voice: "Kokoro", p50LatencyMs: 720, p95LatencyMs: 1180, costPerMin: 0.003, avgRating: 4.0, callCount: 1, languages: ["en"] },
  { provider: "GPT-4o mini", kind: "llm", source: "native", p50LatencyMs: 450, p95LatencyMs: 760, costPerMin: 0.015, avgRating: 4.5, callCount: 2, languages: ["en", "es", "fr"] },
  { provider: "Groq Llama-3.3", kind: "llm", source: "native", p50LatencyMs: 210, p95LatencyMs: 390, costPerMin: 0.008, avgRating: 4.2, callCount: 1, languages: ["en"] },
];

// Preset businesses only — no invented companies.
const BUSINESSES = ["Glow Dental", "Lux Salon", "Hale & Park Law"];
const OUTCOMES = ["booked", "intent", "abandoned"] as const;

// 3 demo calls — one per outcome, one per preset. Relative offsets (ms ago) are
// resolved against `now` at render time so this stays deterministic.
export const MOCK_RECENT_CALLS: CallSummary[] = Array.from({ length: 3 }).map((_, i) => {
  const outcome = OUTCOMES[i % 3];
  const stt = ["Deepgram Flux", "AssemblyAI", "Fal.ai Whisper"][i % 3];
  const tts = ["Cartesia Sonic-3", "ElevenLabs", "Fal.ai Kokoro-82M"][i % 3];
  const ttfw = [320, 540, 880, 1240][i % 4];
  return {
    id: `call_${(i + 1).toString().padStart(4, "0")}`,
    businessName: BUSINESSES[i % BUSINESSES.length],
    status: "ended",
    outcome,
    durationSec: 45 + ((i * 17) % 70),
    costUsd: 0.18 + (i % 5) * 0.04,
    costBreakdown: { stt: 0.04, llm: 0.06, tts: 0.07, platform: 0.03 },
    sttProvider: stt,
    ttsProvider: tts,
    llmProvider: i % 2 === 0 ? "GPT-4o mini" : "Groq Llama-3.3",
    languages: i % 4 === 0 ? ["en", "es"] : ["en"],
    startedAt: -1 * (i * 7 + 2) * 60_000, // i.e. "N minutes ago", resolved at render
    ttfwMs: ttfw,
  };
});
