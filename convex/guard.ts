/**
 * Wave A — Budget / concurrency / rate-limit guard (plan.md §5.4).
 *
 * `canStartCall()` runs before EVERY call and blocks if ANY of:
 *   - total spend  ≥ BUDGET.TOTAL_CAP          → "total_budget"
 *   - day spend    ≥ BUDGET.DAY_CAP            → "daily_budget"
 *   - this visitor ≥ BUDGET.VISITOR_CALL_CAP   → "visitor_cap"
 *   - active calls ≥ BUDGET.MAX_CONCURRENT     → "concurrency"
 * The reason returned is the FIRST failing guard in that precedence order;
 * "ok" when all pass. `allowed === (reason === "ok")`.
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
  args: { visitorKey: v.string() },
  returns: v.object({
    allowed: v.boolean(),
    reason: guardReasonValidator,
  }),
  handler: async (ctx, args) => {
    const today = dayBucket(Date.now());

    const budget = await ctx.db.query("budgetState").first();
    const totalSpent = budget?.totalSpentUsd ?? 0;
    // Only count the day spend if the stored bucket is actually today.
    const daySpent = budget && budget.day === today ? budget.daySpentUsd : 0;
    const activeCalls = budget?.activeCalls ?? 0;

    // Per-visitor usage for today (indexed lookup, never a .filter()).
    const usage = await ctx.db
      .query("visitorUsage")
      .withIndex("by_visitor_day", (q) =>
        q.eq("visitorKey", args.visitorKey).eq("day", today),
      )
      .unique();
    const callsToday = usage?.callsToday ?? 0;

    // First failing guard wins, in cap precedence: total → day → visitor → concurrency.
    let reason: GuardReason = "ok";
    if (totalSpent >= BUDGET.TOTAL_CAP) {
      reason = "total_budget";
    } else if (daySpent >= BUDGET.DAY_CAP) {
      reason = "daily_budget";
    } else if (callsToday >= BUDGET.VISITOR_CALL_CAP) {
      reason = "visitor_cap";
    } else if (activeCalls >= BUDGET.MAX_CONCURRENT) {
      reason = "concurrency";
    }

    return { allowed: reason === "ok", reason };
  },
});
