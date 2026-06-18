/**
 * FROZEN DAY-0 CONTRACT — convex/_contracts.ts
 *
 * The shared, side-effect-free contract module imported widely across the
 * backend. It pins the shapes that cross integration seams:
 *   - the OTel span validator + type (mirrors lib/types.ts TraceSpan),
 *   - the three receptionist tool contracts (plan.md §5.1 / §6),
 *   - the budget/guard decision shape + constants (plan.md §5.4),
 *   - the engine-adapter seam (orchestrator boundary; v1 = VAPI),
 *   - the Fal.ai custom STT/TTS adapter contracts (plan.md §6).
 *
 * RULES (do not break):
 *   - Zero side effects. No top-level IO, no Date.now()/Math.random().
 *   - MUST NOT import ./_generated/api or ./_generated/server. Importing
 *     generated code here would create a cycle and leak runtime concerns into
 *     a pure contract module. Only `convex/values` is allowed.
 *   - Validators and their TS types are co-located and both exported.
 *   - Field names/enums mirror lib/types.ts exactly — changing one is a
 *     breaking change to every parallel workstream.
 */
import { v, type Infer } from "convex/values";

// ════════════════════════════════════════════════════════════════════════════════
// OTel span — mirrors lib/types.ts TraceSpan
// ════════════════════════════════════════════════════════════════════════════════

/** SpanKind = "stt" | "llm" | "tts" | "tool" | "guardrail" | "turn" */
export const spanKindValidator = v.union(
  v.literal("stt"),
  v.literal("llm"),
  v.literal("tts"),
  v.literal("tool"),
  v.literal("guardrail"),
  v.literal("turn"),
);
export type SpanKind = Infer<typeof spanKindValidator>;

/** attrs bag — string | number | boolean values, OTel-style. */
export const spanAttrsValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);
export type SpanAttrs = Infer<typeof spanAttrsValidator>;

/** OTel-shaped span. traceId === the call id. Matches lib/types.ts TraceSpan. */
export const traceSpanValidator = v.object({
  traceId: v.string(),
  spanId: v.string(),
  parentId: v.optional(v.string()),
  kind: spanKindValidator,
  label: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  durationMs: v.number(),
  attrs: v.optional(spanAttrsValidator),
});
export type TraceSpan = Infer<typeof traceSpanValidator>;

// ════════════════════════════════════════════════════════════════════════════════
// Receptionist tool contracts (plan.md §5.1 / §6)
// Each tool: an `*Args` (input) validator and a `*Result` (return) validator,
// plus the matching TS types. The tool endpoints (httpActions) validate against
// these; the VAPI assistantOverrides.tools schema is generated from them.
// "Respond first, log after": handlers return the Result, then emit a span.
// ════════════════════════════════════════════════════════════════════════════════

// ── lookup_knowledge — FAQ/policy retrieval over the keyword search index ────────
export const lookupKnowledgeArgs = v.object({
  /** Required so the search is scoped to the active business's chunks. */
  businessId: v.id("businesses"),
  /** The caller's question / search phrase. */
  query: v.string(),
  /** Max chunks to return. Defaults applied server-side. */
  limit: v.optional(v.number()),
});
export type LookupKnowledgeArgs = Infer<typeof lookupKnowledgeArgs>;

export const lookupKnowledgeResult = v.object({
  found: v.boolean(),
  chunks: v.array(
    v.object({
      chunkId: v.id("knowledgeChunks"),
      text: v.string(),
      tags: v.array(v.string()),
      score: v.optional(v.number()),
    }),
  ),
});
export type LookupKnowledgeResult = Infer<typeof lookupKnowledgeResult>;

// ── check_availability — reads the doc's hours/calendar ──────────────────────────
export const checkAvailabilityArgs = v.object({
  businessId: v.id("businesses"),
  /** ISO date (YYYY-MM-DD) the caller is asking about. */
  date: v.string(),
  /** Optional preferred time-of-day hint, e.g. "morning" | "14:00". */
  preferredTime: v.optional(v.string()),
  /** Optional requested service to scope availability. */
  service: v.optional(v.string()),
});
export type CheckAvailabilityArgs = Infer<typeof checkAvailabilityArgs>;

export const checkAvailabilityResult = v.object({
  available: v.boolean(),
  date: v.string(),
  /** Bookable slots as ISO datetimes (or "HH:mm" wall-clock strings). */
  slots: v.array(v.string()),
  /** Human-readable note, e.g. "Closed Sundays". */
  note: v.optional(v.string()),
});
export type CheckAvailabilityResult = Infer<typeof checkAvailabilityResult>;

// ── book_appointment — captures a structured booking ─────────────────────────────
export const bookAppointmentArgs = v.object({
  businessId: v.id("businesses"),
  /** ISO datetime of the chosen slot. */
  slot: v.string(),
  customerName: v.string(),
  /** Phone or email the booking confirmation goes to. */
  contact: v.string(),
  service: v.optional(v.string()),
  notes: v.optional(v.string()),
  /**
   * Idempotency key so a retried tool-call cannot double-book
   * (plan.md §8.6 "idempotent booking"). The caller passes the same key on retry.
   */
  idempotencyKey: v.optional(v.string()),
});
export type BookAppointmentArgs = Infer<typeof bookAppointmentArgs>;

export const bookAppointmentResult = v.object({
  booked: v.boolean(),
  /** Stable confirmation id for the caller to reference. */
  confirmationId: v.string(),
  slot: v.string(),
  /** ICS payload or a URL the UI can turn into an .ics download. */
  icsUrl: v.optional(v.string()),
  message: v.optional(v.string()),
});
export type BookAppointmentResult = Infer<typeof bookAppointmentResult>;

/** The frozen names VAPI uses to address each tool. Keep in lock-step with VAPI tools config. */
export const RECEPTIONIST_TOOL_NAMES = {
  lookupKnowledge: "lookup_knowledge",
  checkAvailability: "check_availability",
  bookAppointment: "book_appointment",
} as const;
export type ReceptionistToolName =
  (typeof RECEPTIONIST_TOOL_NAMES)[keyof typeof RECEPTIONIST_TOOL_NAMES];

// ════════════════════════════════════════════════════════════════════════════════
// Budget / guard contract (plan.md §5.4) — mirrors lib/types.ts GuardReason
// ════════════════════════════════════════════════════════════════════════════════

/** GuardReason = "ok" | "concurrency" | "visitor_cap" | "daily_budget" | "total_budget" */
export const guardReasonValidator = v.union(
  v.literal("ok"),
  v.literal("concurrency"),
  v.literal("visitor_cap"),
  v.literal("daily_budget"),
  v.literal("total_budget"),
);
export type GuardReason = Infer<typeof guardReasonValidator>;

/** Input to canStartCall(): the only thing it needs is who's asking. */
export const canStartCallArgs = v.object({
  visitorKey: v.string(),
});
export type CanStartCallArgs = Infer<typeof canStartCallArgs>;

/** The canStartCall() decision shape. `allowed === (reason === "ok")`. */
export const canStartCallResult = v.object({
  allowed: v.boolean(),
  reason: guardReasonValidator,
  /** Live snapshot the UI uses to render the graceful state / cost meter. */
  budget: v.object({
    totalSpentUsd: v.number(),
    totalCapUsd: v.number(),
    daySpentUsd: v.number(),
    dayCapUsd: v.number(),
    activeCalls: v.number(),
    maxConcurrent: v.number(),
  }),
  visitor: v.object({
    callsToday: v.number(),
    callsCap: v.number(),
    resetsInMs: v.number(),
  }),
});
export type CanStartCallResult = Infer<typeof canStartCallResult>;

/**
 * Frozen budget constants (plan.md §5.4). The guard blocks if ANY limit is hit.
 * Provider choice can never break the cap — accounting is on actual reported
 * cost and MAX_CALL_SECONDS bounds worst-case per call.
 */
export const BUDGET = {
  /** Global spend cap in USD. */
  TOTAL_CAP: 40,
  /** Per-day spend cap in USD. */
  DAY_CAP: 8,
  /** Calls per visitor per day. NOT currently enforced — the guard no longer
   *  blocks on this; a running call is bounded by MAX_CALL_SECONDS instead.
   *  Retained so the cap can be restored later. */
  VISITOR_CALL_CAP: 2,
  /** Live concurrent calls. */
  MAX_CONCURRENT: 3,
  /** Hard per-call length cap, seconds (maxDurationSeconds on the VAPI call). */
  MAX_CALL_SECONDS: 120,
} as const;

// ════════════════════════════════════════════════════════════════════════════════
// Engine-adapter seam — the orchestrator boundary (plan.md §5 / §6).
// v1 implementation = VAPI. This is JUST the interface/types so a 2nd engine
// (e.g. a self-hosted pipeline) can be slotted in later. No implementation here.
// ════════════════════════════════════════════════════════════════════════════════

/** Which realtime voice engine is orchestrating a given call. */
export type EngineKind = "vapi"; // future: | "pipecat" | "livekit" | ...

/** The per-call pipeline the UI assembles before starting a call. */
export interface EnginePipelineConfig {
  stt: { provider: string; source: "native" | "custom" };
  tts: { provider: string; voice?: string; source: "native" | "custom" };
  llm: { provider: string };
  languages: string[];
}

/** Everything an engine needs to launch one grounded, guarded call. */
export interface EngineStartCallInput {
  sessionId: string;
  visitorKey: string;
  businessId: string;
  /** Business Profile injected AS DATA into the system prompt (injection-guarded). */
  systemPromptData: string;
  pipeline: EnginePipelineConfig;
  /** Frozen tool surface (the three receptionist tools). */
  toolNames: ReceptionistToolName[];
  maxDurationSeconds: number;
  /** Webhook the engine posts lifecycle/cost events to. */
  serverUrl: string;
  /** Honor the privacy/recording consent setting. */
  recordingEnabled: boolean;
}

/** What the engine returns once a call is started (client-driven from here on). */
export interface EngineStartCallResult {
  engine: EngineKind;
  /** Engine-native call id (e.g. VAPI callId) once known. May be filled by webhook. */
  engineCallId?: string;
  /** Our internal calls._id as a string. */
  callId: string;
}

/** Normalized, engine-agnostic end-of-call report the webhook reduces to. */
export interface EngineEndOfCallReport {
  engine: EngineKind;
  engineCallId: string;
  durationSec: number;
  costUsd: number;
  costBreakdown: { stt: number; llm: number; tts: number; platform: number };
  /** Per-component latencies the engine reports (true, authoritative). */
  componentLatencyMs: { stt?: number; llm?: number; tts?: number; ttfw?: number };
  summary?: string;
  structuredData?: unknown;
  successEval?: boolean;
}

/**
 * The orchestrator boundary. v1 = a VAPI-backed implementation living in an
 * action/httpAction; a future engine implements the same surface. Pure type —
 * no methods are wired here.
 */
export interface VoiceEngineAdapter {
  readonly engine: EngineKind;
  /** Build the engine-native start payload (e.g. VAPI transient assistant + overrides). */
  buildStartPayload(input: EngineStartCallInput): unknown;
  /** Reduce a raw engine webhook body to the normalized end-of-call report. */
  parseEndOfCallReport(rawWebhookBody: unknown): EngineEndOfCallReport;
  /** Verify the engine's webhook signature before trusting a body. */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean;
}

// ════════════════════════════════════════════════════════════════════════════════
// Custom STT/TTS adapter contracts — Fal.ai (plan.md §6).
// VAPI custom-transcriber = websocket; custom-voice = HTTP. Types only; the
// adapters are httpAction/Next endpoints that proxy Fal.ai-hosted models.
// ════════════════════════════════════════════════════════════════════════════════

// ── Custom transcriber (STT) — VAPI custom-transcriber WEBSOCKET contract ────────

/** Audio frame format VAPI streams to a custom transcriber. */
export interface CustomTranscriberAudioFormat {
  encoding: "pcm_s16le" | "mulaw" | "linear16";
  sampleRate: number; // e.g. 16000
  channels: number; // typically 1
}

/** First message VAPI sends on the transcriber websocket (config handshake). */
export interface CustomTranscriberStartMessage {
  type: "start";
  encoding: CustomTranscriberAudioFormat["encoding"];
  sampleRate: number;
  channels: number;
  language?: string;
  callId?: string;
}

/**
 * Binary audio frames follow the start message. The adapter forwards them to
 * Fal.ai and emits transcript messages back over the same socket.
 */
export interface CustomTranscriberTranscriptMessage {
  type: "transcript";
  /** Interim vs final hypothesis. */
  channel: "final" | "interim";
  text: string;
  confidence?: number;
  /** Detected language (multilingual). */
  language?: string;
  /** Wall-clock ms relative to call start. */
  startMs?: number;
  endMs?: number;
}

/** The adapter→VAPI websocket message union. */
export type CustomTranscriberOutbound =
  | CustomTranscriberTranscriptMessage
  | { type: "error"; message: string };

/** The seam the Fal.ai STT adapter implements behind the VAPI websocket. */
export interface FalCustomTranscriberAdapter {
  readonly provider: "fal";
  /** Fal.ai model id, e.g. "fal-ai/whisper". */
  readonly model: string;
  onStart(msg: CustomTranscriberStartMessage): void | Promise<void>;
  onAudioFrame(frame: ArrayBuffer): void | Promise<void>;
  /** Pull the next outbound transcript/error to forward to VAPI. */
  drain(): AsyncIterable<CustomTranscriberOutbound>;
  onClose(): void | Promise<void>;
}

// ── Custom voice (TTS) — VAPI custom-voice HTTP contract ─────────────────────────

/** Request body VAPI POSTs to a custom-voice endpoint to synthesize a chunk. */
export interface CustomVoiceRequest {
  /** Text to synthesize. */
  message: { type: "voice-request"; text: string };
  /** Desired output audio format. */
  sampleRate: number; // e.g. 24000
  /** Selected Fal.ai voice (e.g. "Kokoro"). */
  voice?: string;
  language?: string;
  callId?: string;
}

/**
 * Response: the adapter streams raw audio bytes back (HTTP chunked / streaming
 * body), in the requested format. Metadata for our own telemetry only.
 */
export interface CustomVoiceResponseMeta {
  contentType: "audio/pcm" | "audio/wav" | "audio/mpeg";
  sampleRate: number;
  /** Time-to-first-byte the adapter observed, for the tts span. */
  ttfbMs?: number;
}

/** The seam the Fal.ai TTS adapter implements behind the VAPI custom-voice HTTP endpoint. */
export interface FalCustomVoiceAdapter {
  readonly provider: "fal";
  /** Fal.ai model id, e.g. "fal-ai/kokoro". */
  readonly model: string;
  /** Synthesize text → a streaming audio body plus telemetry meta. */
  synthesize(
    req: CustomVoiceRequest,
  ): Promise<{ audio: ReadableStream<Uint8Array>; meta: CustomVoiceResponseMeta }>;
}
