/**
 * Wave A — Call lifecycle (plan.md §5.2).
 *
 * The authoritative record of every call: start → live → ended. Budget and
 * concurrency accounting hang off this file:
 *   - startCall re-checks the guard SERVER-SIDE (a client that skips
 *     canStartCall() still can't slip past the cap), inserts the "live" row,
 *     bumps activeCalls, and increments the visitor's daily usage.
 *   - recordEndOfCall (called by the webhook scheduler) finalizes the row,
 *     decrements concurrency, and adds the call's ACTUAL reported cost to
 *     budgetState.
 *
 * Read surfaces (queries) map rows to the frozen lib/types.ts shapes.
 * All reads go through indexes — no `.filter()` for WHERE.
 */
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { BUDGET, type GuardReason } from "./_contracts";
import {
  incActiveHelper,
  recordCostOnce,
  releaseConcurrencyOnce,
} from "./budget";

// ── helpers ───────────────────────────────────────────────────────────────────

/** UTC day bucket (YYYY-MM-DD) for a given epoch ms. */
function dayBucket(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Start-of-local-day epoch ms for a given epoch ms (local server tz). */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Server-side guard re-check, mirroring guard.canStartCall. Returns the first
 * failing reason, or "ok". Runs inside the mutation transaction so it's
 * race-free against concurrent starts.
 */
async function guardCheck(
  ctx: MutationCtx,
  now: number,
): Promise<GuardReason> {
  const today = dayBucket(now);

  const budget = await ctx.db.query("budgetState").first();
  const totalSpent = budget?.totalSpentUsd ?? 0;
  const daySpent = budget && budget.day === today ? budget.daySpentUsd : 0;
  const activeCalls = budget?.activeCalls ?? 0;

  // The per-visitor daily call cap is removed for now — a running call is
  // bounded instead by the per-call duration cutoff (BUDGET.MAX_CALL_SECONDS).
  if (totalSpent >= BUDGET.TOTAL_CAP) return "total_budget";
  if (daySpent >= BUDGET.DAY_CAP) return "daily_budget";
  if (activeCalls >= BUDGET.MAX_CONCURRENT) return "concurrency";
  return "ok";
}

const costBreakdownValidator = v.object({
  stt: v.number(),
  llm: v.number(),
  tts: v.number(),
  platform: v.number(),
});

/** lib/types.ts CallSummary shape. */
const callSummaryValidator = v.object({
  id: v.string(),
  businessName: v.string(),
  status: v.union(
    v.literal("idle"),
    v.literal("connecting"),
    v.literal("live"),
    v.literal("ended"),
  ),
  outcome: v.union(
    v.literal("booked"),
    v.literal("intent"),
    v.literal("abandoned"),
  ),
  durationSec: v.number(),
  costUsd: v.number(),
  costBreakdown: costBreakdownValidator,
  sttProvider: v.string(),
  ttsProvider: v.string(),
  llmProvider: v.string(),
  languages: v.array(v.string()),
  startedAt: v.number(),
  ttfwMs: v.number(),
});

/** Map a call doc → CallSummary. Outcome/ttfw get safe defaults when absent. */
function toCallSummary(c: Doc<"calls">) {
  return {
    id: c._id,
    businessName: c.businessName,
    status: c.status,
    outcome: c.outcome ?? ("abandoned" as const),
    durationSec: c.durationSec,
    costUsd: c.costUsd,
    costBreakdown: c.costBreakdown,
    sttProvider: c.sttProvider,
    ttsProvider: c.ttsProvider,
    llmProvider: c.llmProvider,
    languages: c.languages,
    startedAt: c.startedAt,
    ttfwMs: c.ttfwMs ?? 0,
  };
}

/** QualityMetrics projection (mirrors schema.ts qualityMetrics). */
const qualityMetricsValidator = v.object({
  talkRatio: v.number(),
  interruptions: v.number(),
  deadAirSec: v.number(),
  wpm: v.number(),
  sentiment: v.optional(v.number()),
});

/**
 * Non-PII projection of a call for the owner-facing /calls/[id] report.
 * Deliberately EXCLUDES sessionId, vapiCallId, visitorKey, and the internal
 * finalization markers (concurrencyReleased/costRecorded) — the report renders
 * none of them, and internal keys shouldn't cross the read seam. Typing the
 * return here is the single owner of the report shape, replacing the
 * hand-maintained `as {…}` cast the client used to carry.
 */
const callReportValidator = v.object({
  _id: v.id("calls"),
  businessName: v.string(),
  status: v.union(
    v.literal("idle"),
    v.literal("connecting"),
    v.literal("live"),
    v.literal("ended"),
  ),
  outcome: v.optional(
    v.union(v.literal("booked"), v.literal("intent"), v.literal("abandoned")),
  ),
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  durationSec: v.number(),
  costUsd: v.number(),
  costBreakdown: costBreakdownValidator,
  sttProvider: v.string(),
  ttsProvider: v.string(),
  ttsVoice: v.optional(v.string()),
  llmProvider: v.string(),
  languages: v.array(v.string()),
  ttfwMs: v.optional(v.number()),
  successEval: v.optional(v.boolean()),
  summary: v.optional(v.string()),
  structuredData: v.optional(v.any()),
  qualityMetrics: v.optional(qualityMetricsValidator),
});

/** Map a call doc → the non-PII report projection. */
function toCallReport(c: Doc<"calls">) {
  return {
    _id: c._id,
    businessName: c.businessName,
    status: c.status,
    outcome: c.outcome,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    durationSec: c.durationSec,
    costUsd: c.costUsd,
    costBreakdown: c.costBreakdown,
    sttProvider: c.sttProvider,
    ttsProvider: c.ttsProvider,
    ttsVoice: c.ttsVoice,
    llmProvider: c.llmProvider,
    languages: c.languages,
    ttfwMs: c.ttfwMs,
    successEval: c.successEval,
    summary: c.summary,
    structuredData: c.structuredData,
    qualityMetrics: c.qualityMetrics,
  };
}

// ── startCall ─────────────────────────────────────────────────────────────────
export const startCall = mutation({
  args: {
    sessionId: v.string(),
    businessId: v.id("businesses"),
    visitorKey: v.string(),
    sttProvider: v.string(),
    ttsProvider: v.string(),
    ttsVoice: v.optional(v.string()),
    llmProvider: v.string(),
  },
  returns: v.id("calls"),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Authoritative server-side guard. A blocked call throws — the client
    // should have called canStartCall() first and rendered the graceful state.
    const reason = await guardCheck(ctx, now);
    if (reason !== "ok") {
      throw new Error(`call_blocked:${reason}`);
    }

    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("business_not_found");
    }

    // Insert the live call row.
    const callId = await ctx.db.insert("calls", {
      sessionId: args.sessionId,
      businessId: args.businessId,
      businessName: business.name,
      status: "live",
      startedAt: now,
      durationSec: 0,
      costUsd: 0,
      costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
      sttProvider: args.sttProvider,
      ttsProvider: args.ttsProvider,
      ttsVoice: args.ttsVoice,
      llmProvider: args.llmProvider,
      languages: [],
      visitorKey: args.visitorKey,
    });

    // Bump live concurrency.
    await incActiveHelper(ctx);

    // Increment this visitor's daily usage (indexed upsert).
    const today = dayBucket(now);
    const usage = await ctx.db
      .query("visitorUsage")
      .withIndex("by_visitor_day", (q) =>
        q.eq("visitorKey", args.visitorKey).eq("day", today),
      )
      .unique();
    if (usage) {
      await ctx.db.patch(usage._id, { callsToday: usage.callsToday + 1 });
    } else {
      await ctx.db.insert("visitorUsage", {
        visitorKey: args.visitorKey,
        day: today,
        callsToday: 1,
      });
    }

    return callId;
  },
});

// ── attachVapiId ──────────────────────────────────────────────────────────────
export const attachVapiId = mutation({
  args: { callId: v.id("calls"), vapiCallId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { vapiCallId: args.vapiCallId });
    return null;
  },
});

// ── getByVapiId ───────────────────────────────────────────────────────────────
export const getByVapiId = query({
  args: { vapiCallId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_vapiCallId", (q) => q.eq("vapiCallId", args.vapiCallId))
      .unique();
    return call ?? null;
  },
});

// ── getById ───────────────────────────────────────────────────────────────────
// Ownership-gated AND projected: the call record carries PII (structuredData.booking =
// customer name + contact) plus internal keys, so we (a) only return it to the visitor
// who owns the call and (b) return a typed non-PII projection (toCallReport) — never the
// raw doc — so sessionId/vapiCallId/visitorKey can't leak even to the owner's client.
// We gate on `visitorKey` (NOT sessionId, which recordQualityMetrics uses): this
// query is read by the /calls/[id] report page, which holds only the persisted
// per-browser visitorKey — the per-call sessionId is an in-memory UUID it cannot
// recover. startCall stores visitorKey on every call row, so the owner's browser
// re-presents a matching key; a third party holding only a callId gets null,
// identical to a missing call, so cross-visitor PII is never exposed.
export const getById = query({
  args: { callId: v.id("calls"), visitorKey: v.string() },
  returns: v.union(callReportValidator, v.null()),
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.visitorKey !== args.visitorKey) return null;
    return toCallReport(call);
  },
});

// ── recordQualityMetrics (public; client, on call-end) ────────────────────────
// The four deterministic metrics are computed client-side from the buffered
// transcript + derived spans (the server has no per-turn transcript to recompute
// from). sentiment is deferred (needs a model call), so it is omitted here.
// Guarded: the call must exist and the caller's sessionId must own it. Values are
// clamped to physically-possible ranges so a crafted client can't store garbage.
export const recordQualityMetrics = mutation({
  args: {
    callId: v.id("calls"),
    sessionId: v.string(),
    metrics: v.object({
      talkRatio: v.number(),
      interruptions: v.number(),
      deadAirSec: v.number(),
      wpm: v.number(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.sessionId !== args.sessionId) return null;
    const m = args.metrics;
    await ctx.db.patch(args.callId, {
      qualityMetrics: {
        talkRatio: Math.min(1, Math.max(0, m.talkRatio)),
        interruptions: Math.max(0, Math.round(m.interruptions)),
        deadAirSec: Math.max(0, m.deadAirSec),
        wpm: Math.max(0, m.wpm),
      },
    });
    return null;
  },
});

// ── listRecent ────────────────────────────────────────────────────────────────
// Recent ENDED calls, newest-first, mapped to CallSummary.
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(callSummaryValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    // by_startedAt descending; keep only ended calls, then take `limit`.
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_startedAt")
      .order("desc")
      .take(limit * 3); // over-fetch a little so filtering to ended still fills.
    const ended = rows.filter((c) => c.status === "ended").slice(0, limit);
    return ended.map(toCallSummary);
  },
});

// ── activeCount ───────────────────────────────────────────────────────────────
export const activeCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const live = await ctx.db
      .query("calls")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect();
    return live.length;
  },
});

// ── countToday ────────────────────────────────────────────────────────────────
// Calls started since local midnight.
export const countToday = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const since = startOfLocalDay(Date.now());
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_startedAt", (q) => q.gte("startedAt", since))
      .collect();
    return rows.length;
  },
});

// ── countLast24h ──────────────────────────────────────────────────────────────
export const countLast24h = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_startedAt", (q) => q.gte("startedAt", since))
      .collect();
    return rows.length;
  },
});

// ── listRecentAnonymized ──────────────────────────────────────────────────────
// Recent-calls wall: safe fields only (no sessionId / visitorKey / vapiCallId).
export const listRecentAnonymized = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      id: v.string(),
      businessName: v.string(),
      outcome: v.union(
        v.literal("booked"),
        v.literal("intent"),
        v.literal("abandoned"),
      ),
      sttProvider: v.string(),
      ttsProvider: v.string(),
      llmProvider: v.string(),
      durationSec: v.number(),
      costUsd: v.number(),
      languages: v.array(v.string()),
      startedAt: v.number(),
      ttfwMs: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_startedAt")
      .order("desc")
      .take(limit * 3);
    const ended = rows.filter((c) => c.status === "ended").slice(0, limit);
    return ended.map((c) => ({
      id: c._id,
      businessName: c.businessName,
      outcome: c.outcome ?? ("abandoned" as const),
      sttProvider: c.sttProvider,
      ttsProvider: c.ttsProvider,
      llmProvider: c.llmProvider,
      durationSec: c.durationSec,
      costUsd: c.costUsd,
      languages: c.languages,
      startedAt: c.startedAt,
      ttfwMs: c.ttfwMs ?? 0,
    }));
  },
});

// ── recordEndOfCall (internal; webhook scheduler) ─────────────────────────────
// Finalize the call from VAPI's end-of-call report: set ended, fill cost +
// latencies + analysis, decrement concurrency, add cost to the budget, derive
// the outcome.
export const recordEndOfCall = internalMutation({
  args: {
    vapiCallId: v.string(),
    durationSec: v.number(),
    costUsd: v.number(),
    costBreakdown: costBreakdownValidator,
    summary: v.optional(v.string()),
    structuredData: v.optional(v.any()),
    successEval: v.optional(v.boolean()),
    languages: v.optional(v.array(v.string())),
    ttfwMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_vapiCallId", (q) => q.eq("vapiCallId", args.vapiCallId))
      .unique();

    if (!call) {
      // Unknown call id (e.g. a call started outside our flow, or a duplicate
      // webhook after the row was purged). Nothing to finalize.
      return null;
    }

    const now = Date.now();
    const endedAt = call.startedAt + args.durationSec * 1000;

    // Derive outcome: prefer an explicit booking in structuredData, else fall
    // back to the success evaluation, else "intent" when there was real talk,
    // else "abandoned".
    const outcome = deriveOutcome(
      args.structuredData,
      args.successEval,
      args.durationSec,
      call.outcome,
    );

    await ctx.db.patch(call._id, {
      status: "ended",
      endedAt,
      durationSec: args.durationSec,
      costUsd: args.costUsd,
      costBreakdown: args.costBreakdown,
      summary: args.summary ?? call.summary,
      structuredData: args.structuredData ?? call.structuredData,
      successEval: args.successEval ?? call.successEval,
      languages: args.languages ?? call.languages,
      ttfwMs: args.ttfwMs ?? call.ttfwMs,
      outcome,
    });

    // Record cost and release concurrency, each independently idempotent via
    // per-call markers (budget.recordCostOnce / releaseConcurrencyOnce). A
    // second webhook, or a client endCall that already released the slot, is a
    // no-op — but a dropped cost (client endCall first, which canNOT know cost)
    // is still recorded here. `call` is the doc as read at the top of this
    // handler, so its markers reflect DB state before this mutation. Cost is
    // bucketed against the call's OWN day so a midnight-crossing call accounts
    // to the day it started.
    await recordCostOnce(ctx, call, args.costUsd, dayBucket(call.startedAt));
    await releaseConcurrencyOnce(ctx, call);

    return null;
  },
});

/** Outcome derivation used by recordEndOfCall (pure). */
function deriveOutcome(
  structuredData: unknown,
  successEval: boolean | undefined,
  durationSec: number,
  prior: Doc<"calls">["outcome"],
): NonNullable<Doc<"calls">["outcome"]> {
  // An explicit booking on the call wins (also set by bookAppointment).
  if (
    structuredData &&
    typeof structuredData === "object" &&
    "booking" in (structuredData as Record<string, unknown>) &&
    (structuredData as Record<string, unknown>).booking
  ) {
    return "booked";
  }
  if (
    typeof structuredData === "object" &&
    structuredData !== null &&
    (structuredData as Record<string, unknown>).booked === true
  ) {
    return "booked";
  }
  if (prior === "booked") return "booked";
  if (successEval === true) return "booked";
  // Some real conversation happened but no booking → intent; otherwise abandoned.
  if (durationSec >= 15) return "intent";
  return "abandoned";
}
