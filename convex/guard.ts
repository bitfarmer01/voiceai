/**
 * Wave A — Budget / concurrency / rate-limit guard (plan.md §5.4).
 *
 * `canStartCall()` runs before EVERY call and blocks if ANY of:
 *   - total spend  ≥ BUDGET.TOTAL_CAP          → "total_budget"
 *   - day spend    ≥ BUDGET.DAY_CAP            → "daily_budget"
 *   - active calls ≥ BUDGET.MAX_CONCURRENT     → "concurrency"
 * The reason returned is the FIRST failing guard in that precedence order;
 * "ok" when all pass. `allowed === (reason === "ok")`.
 *
 * The per-visitor daily call cap is removed for now — a single call is bounded
 * instead by the per-call duration cutoff (BUDGET.MAX_CALL_SECONDS), so a call
 * auto-ends once it has used its allowance. "visitor_cap" is therefore never
 * returned today; the literal is retained so the cap can be restored later.
 *
 * Pure read (query) — the authoritative re-check happens server-side inside
 * calls.startCall so a client that ignores this can't slip past the cap.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { BUDGET, guardReasonValidator, type GuardReason } from "./_contracts";

/** UTC day bucket (YYYY-MM-DD) for a given epoch ms. */
function dayBucket(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const canStartCall = query({
  // visitorKey is optional and unread — the per-visitor daily cap is removed
  // (see header). Retained for forward-compat. Mirrors _contracts.canStartCallArgs.
  args: { visitorKey: v.optional(v.string()) },
  returns: v.object({
    allowed: v.boolean(),
    reason: guardReasonValidator,
  }),
  handler: async (ctx) => {
    const today = dayBucket(Date.now());

    const budget = await ctx.db.query("budgetState").first();
    const totalSpent = budget?.totalSpentUsd ?? 0;
    // Only count the day spend if the stored bucket is actually today.
    const daySpent = budget && budget.day === today ? budget.daySpentUsd : 0;
    const activeCalls = budget?.activeCalls ?? 0;

    // First failing guard wins, in cap precedence: total → day → concurrency.
    // (The per-visitor daily call cap is intentionally not enforced — see header.)
    let reason: GuardReason = "ok";
    if (totalSpent >= BUDGET.TOTAL_CAP) {
      reason = "total_budget";
    } else if (daySpent >= BUDGET.DAY_CAP) {
      reason = "daily_budget";
    } else if (activeCalls >= BUDGET.MAX_CONCURRENT) {
      reason = "concurrency";
    }

    return { allowed: reason === "ok", reason };
  },
});
