/**
 * FROZEN DAY-0 CONTRACT — convex/schema.ts
 *
 * The authoritative table list for the VAPI voice-receptionist app (plan.md §10).
 * Field names and enums mirror lib/types.ts exactly so the frontend and backend
 * never drift (CallStatus, CallOutcome, ProviderKind, ProviderSource, SpanKind,
 * CostBreakdown, …). Every documented read path has a matching index — no
 * `.filter()` for WHERE clauses.
 *
 * Changing a field or enum here is a breaking change to every parallel
 * workstream. Treat additions as `v.optional(...)` and coordinate before
 * tightening.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ── Shared enum validators (mirror lib/types.ts) ────────────────────────────────
// CallStatus = "idle" | "connecting" | "live" | "ended"
const callStatus = v.union(
  v.literal("idle"),
  v.literal("connecting"),
  v.literal("live"),
  v.literal("ended"),
);
// CallOutcome = "booked" | "intent" | "abandoned"
const callOutcome = v.union(
  v.literal("booked"),
  v.literal("intent"),
  v.literal("abandoned"),
);
// ProviderKind = "stt" | "tts" | "llm"
const providerKind = v.union(
  v.literal("stt"),
  v.literal("tts"),
  v.literal("llm"),
);
// ProviderSource = "native" | "custom"  (custom = Fal.ai adapter)
const providerSource = v.union(v.literal("native"), v.literal("custom"));
// SpanKind = "stt" | "llm" | "tts" | "tool" | "guardrail" | "turn"
const spanKind = v.union(
  v.literal("stt"),
  v.literal("llm"),
  v.literal("tts"),
  v.literal("tool"),
  v.literal("guardrail"),
  v.literal("turn"),
);
// TurnRole = "user" | "assistant" | "system"
const turnRole = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
);
// EvalStatus = "pass" | "fail"
const evalStatus = v.union(v.literal("pass"), v.literal("fail"));

// CostBreakdown — mirrors lib/types.ts CostBreakdown
const costBreakdown = v.object({
  stt: v.number(),
  llm: v.number(),
  tts: v.number(),
  platform: v.number(),
});

// QualityMetrics — plan.md §10 calls.qualityMetrics / §8.7
const qualityMetrics = v.object({
  talkRatio: v.number(),
  interruptions: v.number(),
  deadAirSec: v.number(),
  wpm: v.number(),
  sentiment: v.number(),
});

// Business profile — plan.md §5.1 / §10 businesses.profile
const businessProfile = v.object({
  companyName: v.string(),
  hours: v.string(),
  services: v.array(v.string()),
  policies: v.array(v.string()),
  availability: v.string(),
});

export default defineSchema({
  // ── businesses ────────────────────────────────────────────────────────────────
  // plan.md §10: kind preset|upload, ephemeral session-scoped with expiresAt.
  businesses: defineTable({
    kind: v.union(v.literal("preset"), v.literal("upload")),
    sessionId: v.optional(v.string()),
    name: v.string(),
    profile: businessProfile,
    sourceMeta: v.optional(
      v.object({
        fileName: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        bytes: v.optional(v.number()),
        pages: v.optional(v.number()),
        storageId: v.optional(v.id("_storage")),
      }),
    ),
    chunkCount: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_kind", ["kind"])
    .index("by_expiresAt", ["expiresAt"]),

  // ── knowledgeChunks ───────────────────────────────────────────────────────────
  // plan.md §5.1 / §10: FAQ/policy chunks; keyword search powers lookup_knowledge.
  knowledgeChunks: defineTable({
    businessId: v.id("businesses"),
    text: v.string(),
    tags: v.array(v.string()),
  })
    .index("by_business", ["businessId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["businessId"],
    }),

  // ── calls ─────────────────────────────────────────────────────────────────────
  // plan.md §10 + lib/types.ts CallSummary. costBreakdown, providers, languages,
  // structured booking + analysis live here.
  calls: defineTable({
    sessionId: v.string(),
    businessId: v.id("businesses"),
    businessName: v.string(),
    vapiCallId: v.optional(v.string()),
    status: callStatus,
    outcome: v.optional(callOutcome),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationSec: v.number(),
    costUsd: v.number(),
    costBreakdown: costBreakdown,
    sttProvider: v.string(),
    ttsProvider: v.string(),
    ttsVoice: v.optional(v.string()),
    llmProvider: v.string(),
    languages: v.array(v.string()),
    ttfwMs: v.optional(v.number()),
    successEval: v.optional(v.boolean()),
    summary: v.optional(v.string()),
    structuredData: v.optional(v.any()),
    qualityMetrics: v.optional(qualityMetrics),
    guardrailEvents: v.optional(v.array(v.string())),
    visitorKey: v.optional(v.string()),
  })
    .index("by_vapiCallId", ["vapiCallId"])
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"])
    .index("by_business", ["businessId"])
    .index("by_visitor", ["visitorKey"]),

  // ── spans ─────────────────────────────────────────────────────────────────────
  // plan.md §5.3 / §10. OTel-shaped; traceId === callId. Mirror lib/types.ts
  // TraceSpan (and convex/_contracts.ts traceSpanValidator).
  spans: defineTable({
    traceId: v.string(),
    spanId: v.string(),
    parentId: v.optional(v.string()),
    kind: spanKind,
    label: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    durationMs: v.number(),
    attrs: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  }).index("by_trace", ["traceId"]),

  // ── logs ──────────────────────────────────────────────────────────────────────
  // plan.md §5.3 / §10. Structured logs correlated by traceId.
  logs: defineTable({
    traceId: v.string(),
    ts: v.number(),
    level: v.union(
      v.literal("debug"),
      v.literal("info"),
      v.literal("warn"),
      v.literal("error"),
    ),
    msg: v.string(),
    attrs: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  }).index("by_trace", ["traceId"]),

  // ── transcriptTurns ───────────────────────────────────────────────────────────
  // plan.md §10 + lib/types.ts TranscriptTurn.
  transcriptTurns: defineTable({
    callId: v.id("calls"),
    idx: v.number(),
    role: turnRole,
    text: v.string(),
    ts: v.number(),
    interim: v.optional(v.boolean()),
    confidence: v.optional(v.number()),
  }).index("by_call", ["callId"]),

  // ── voiceRatings ──────────────────────────────────────────────────────────────
  // plan.md §10. "Rate this voice" ★ — feeds providerStats.avgRating.
  voiceRatings: defineTable({
    callId: v.id("calls"),
    ttsProvider: v.string(),
    ttsVoice: v.optional(v.string()),
    stars: v.number(),
    visitorKey: v.optional(v.string()),
  })
    .index("by_provider", ["ttsProvider"])
    .index("by_call", ["callId"]),

  // ── providerStats ─────────────────────────────────────────────────────────────
  // plan.md §10 rollup + lib/types.ts ProviderStat. Updated async on call-end.
  providerStats: defineTable({
    provider: v.string(),
    kind: providerKind,
    source: providerSource,
    voice: v.optional(v.string()),
    p50LatencyMs: v.number(),
    p95LatencyMs: v.number(),
    costPerMin: v.number(),
    avgRating: v.number(),
    callCount: v.number(),
    languages: v.array(v.string()),
  })
    .index("by_kind", ["kind"])
    .index("by_provider", ["provider"]),

  // ── evalCases ─────────────────────────────────────────────────────────────────
  // plan.md §8.3 / §10.
  evalCases: defineTable({
    name: v.string(),
    businessId: v.id("businesses"),
    script: v.array(
      v.object({
        role: turnRole,
        text: v.string(),
      }),
    ),
    expectations: v.array(v.string()),
  }).index("by_business", ["businessId"]),

  // ── evalRuns ──────────────────────────────────────────────────────────────────
  // plan.md §8.3 / §10. Regression view across config changes.
  evalRuns: defineTable({
    caseId: v.id("evalCases"),
    config: v.object({
      stt: v.string(),
      tts: v.string(),
      llm: v.string(),
      businessId: v.id("businesses"),
    }),
    status: evalStatus,
    passed: v.boolean(),
    score: v.number(),
    latencyMs: v.number(),
    groundingScore: v.number(),
    transcript: v.string(),
    createdAt: v.number(),
  }).index("by_case", ["caseId"]),

  // ── budgetState (singleton) ───────────────────────────────────────────────────
  // plan.md §5.4 / §10. Authoritative spend, summed from VAPI reported cost.
  budgetState: defineTable({
    totalSpentUsd: v.number(),
    daySpentUsd: v.number(),
    day: v.string(), // YYYY-MM-DD bucket the daySpentUsd applies to
    activeCalls: v.number(),
  }),

  // ── visitorUsage ──────────────────────────────────────────────────────────────
  // plan.md §5.4 / §10. Per-visitor daily call cap (VISITOR_CALL_CAP = 2).
  visitorUsage: defineTable({
    visitorKey: v.string(),
    day: v.string(), // YYYY-MM-DD
    callsToday: v.number(),
  }).index("by_visitor_day", ["visitorKey", "day"]),

  // ── leads ─────────────────────────────────────────────────────────────────────
  // plan.md §8.7 / §10. Escalation / callback capture.
  leads: defineTable({
    callId: v.id("calls"),
    businessId: v.id("businesses"),
    contact: v.string(),
    request: v.string(),
    createdAt: v.number(),
  })
    .index("by_call", ["callId"])
    .index("by_business", ["businessId"]),
});
