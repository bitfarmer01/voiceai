/**
 * Frozen domain vocabulary + UI-facing types (ui-development-plan.md §2, plan.md §10).
 * These are the integration seam the UI builds against. The Convex schema mirrors them;
 * `lib/data/*` hooks return these shapes (mock now, `useQuery(api...)` later) so screens
 * never change when the backend goes live.
 */

// ── Frozen StatusBadge vocabulary ──────────────────────────────────────────────
export type CallStatus = "idle" | "connecting" | "live" | "ended";
export type CallOutcome = "booked" | "intent" | "abandoned";
export type EvalStatus = "pass" | "fail";

export type ProviderKind = "stt" | "tts" | "llm";
export type ProviderSource = "native" | "custom"; // custom = Fal.ai adapter

// ── Providers ──────────────────────────────────────────────────────────────────
export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  source: ProviderSource;
  voice?: string;
  costPerMin: number;
  languages: string[];
}

// ── Budget / guard ──────────────────────────────────────────────────────────────
export interface BudgetState {
  totalSpentUsd: number;
  totalCapUsd: number; // 40
  daySpentUsd: number;
  dayCapUsd: number; // 8
  activeCalls: number;
  maxConcurrent: number; // 3
}

export type GuardReason =
  | "ok"
  | "concurrency"
  | "visitor_cap"
  | "daily_budget"
  | "total_budget";

export interface VisitorUsage {
  callsToday: number;
  callsCap: number; // 2
  resetsInMs: number;
}

// ── Telemetry (OTel-shaped span) ────────────────────────────────────────────────
export type SpanKind = "stt" | "llm" | "tts" | "tool" | "guardrail" | "turn";

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentId?: string;
  kind: SpanKind;
  label: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  attrs?: Record<string, string | number | boolean>;
}

export interface CostBreakdown {
  stt: number;
  llm: number;
  tts: number;
  platform: number;
}

// ── Transcript / timeline ───────────────────────────────────────────────────────
export type TurnRole = "user" | "assistant" | "system";

export interface TranscriptTurn {
  idx: number;
  role: TurnRole;
  text: string;
  ts: number;
  interim?: boolean;
  confidence?: number;
}

// ── Call summary (cards, recent-calls, report) ──────────────────────────────────
export interface CallSummary {
  id: string;
  businessName: string;
  status: CallStatus;
  outcome: CallOutcome;
  durationSec: number;
  costUsd: number;
  costBreakdown: CostBreakdown;
  sttProvider: string;
  ttsProvider: string;
  llmProvider: string;
  languages: string[];
  startedAt: number;
  ttfwMs: number;
}

// ── Leaderboard ─────────────────────────────────────────────────────────────────
export interface ProviderStat {
  provider: string;
  kind: ProviderKind;
  source: ProviderSource;
  voice?: string;
  p50LatencyMs: number;
  p95LatencyMs: number;
  costPerMin: number;
  avgRating: number;
  callCount: number;
  languages: string[];
}

// ── Booking (structured outcome of book_appointment) ────────────────────────────
export interface Booking {
  /** The `leads` row id — also the path segment for the .ics download. */
  confirmationId: string;
  /** ISO datetime or "HH:mm" wall-clock string of the chosen slot. */
  slot: string;
  customerName: string;
  contact: string;
  service?: string | null;
  notes?: string | null;
  bookedAt: number;
}

// ── Business profile (grounding) ────────────────────────────────────────────────
export interface BusinessProfile {
  id: string;
  name: string;
  kind: "preset" | "upload";
  hours: string;
  services: string[];
  policies: string[];
  chunkCount: number;
}
