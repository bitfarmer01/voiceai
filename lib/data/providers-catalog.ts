/**
 * The selectable CATALOG of voices/options backing the data seam (lib/data/index.ts).
 * This is configuration — the set of providers a user can pick — NOT measured usage.
 * No fabricated metrics live here. Screens import the hooks, never this fixture directly.
 */
import type { Provider } from "@/lib/types";

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
