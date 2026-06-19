/**
 * Wave A — Budget accounting (plan.md §5.4).
 *
 * `budgetState` is a SINGLETON: at most one row. It holds the authoritative
 * spend (summed from VAPI's reported per-call cost), the day bucket the day
 * spend applies to, and the live concurrent-call count.
 *
 * Public surface:
 *   - getPublicState — the cost meter the UI renders against the caps.
 * Internal helpers (called from calls.ts / the webhook scheduler):
 *   - addCost   — add a call's reported cost to total + day spend.
 *   - incActive / decActive — bump the live concurrency counter.
 */
import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { BUDGET } from "./_contracts";

/** UTC day bucket (YYYY-MM-DD) for a given epoch ms. */
function dayBucket(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Read the singleton row (or null if not seeded yet). */
async function readSingleton(
  ctx: MutationCtx,
): Promise<Doc<"budgetState"> | null> {
  return await ctx.db.query("budgetState").first();
}

// ── Shared write helpers (plain functions) ──────────────────────────────────────
// These hold the actual logic so both the internalMutations below AND other
// mutations (calls.startCall, calls.recordEndOfCall) can reuse them WITHOUT a
// nested ctx.runMutation subtransaction.

export async function addCostHelper(
  ctx: MutationCtx,
  usd: number,
  day: string,
): Promise<void> {
  const row = await readSingleton(ctx);
  if (!row) {
    await ctx.db.insert("budgetState", {
      totalSpentUsd: usd,
      daySpentUsd: usd,
      day,
      activeCalls: 0,
    });
    return;
  }
  const sameDay = row.day === day;
  await ctx.db.patch(row._id, {
    totalSpentUsd: row.totalSpentUsd + usd,
    daySpentUsd: (sameDay ? row.daySpentUsd : 0) + usd,
    day,
  });
}

export async function incActiveHelper(ctx: MutationCtx): Promise<void> {
  const row = await readSingleton(ctx);
  if (!row) {
    await ctx.db.insert("budgetState", {
      totalSpentUsd: 0,
      daySpentUsd: 0,
      day: dayBucket(Date.now()),
      activeCalls: 1,
    });
    return;
  }
  await ctx.db.patch(row._id, { activeCalls: row.activeCalls + 1 });
}

export async function decActiveHelper(ctx: MutationCtx): Promise<void> {
  const row = await readSingleton(ctx);
  if (!row) return;
  // Never go negative (a double-decrement from a retried webhook is benign).
  await ctx.db.patch(row._id, { activeCalls: Math.max(0, row.activeCalls - 1) });
}

// ── Per-call idempotent finalization helpers ────────────────────────────────────
// Cost-record and concurrency-release are finalized from TWO call sites that can
// fire in any order (lifecycle.endCall on client teardown, calls.recordEndOfCall
// on the VAPI webhook). A single status flag wrongly conjoins two facts that need
// OPPOSITE handling on a second pass. These markers make each fact independently
// idempotent: the marker is read off the call doc (its DB state before this
// mutation) and patched on first action, so a second pass — in either order — is
// a no-op. Within one mutation transaction, patching the marker alongside the
// caller's own patch of the same doc is fine.

/**
 * Release the call's concurrency slot exactly once. No-op if already released.
 * `call` is the doc as read at the top of the calling handler.
 */
export async function releaseConcurrencyOnce(
  ctx: MutationCtx,
  call: Doc<"calls">,
): Promise<void> {
  if (call.concurrencyReleased) return;
  await decActiveHelper(ctx);
  await ctx.db.patch(call._id, { concurrencyReleased: true });
}

/**
 * Record the call's reported cost exactly once. No-op if already recorded.
 * `usd` is the authoritative reported cost; `day` is the YYYY-MM-DD bucket it
 * belongs to (the caller passes the call's own day so a midnight-crossing call
 * accounts to the day it started).
 */
export async function recordCostOnce(
  ctx: MutationCtx,
  call: Doc<"calls">,
  usd: number,
  day: string,
): Promise<void> {
  if (call.costRecorded) return;
  await addCostHelper(ctx, usd, day);
  await ctx.db.patch(call._id, { costRecorded: true });
}

export const getPublicState = query({
  args: {},
  returns: v.object({
    totalSpentUsd: v.number(),
    totalCapUsd: v.number(),
    daySpentUsd: v.number(),
    dayCapUsd: v.number(),
    activeCalls: v.number(),
    maxConcurrent: v.number(),
  }),
  handler: async (ctx) => {
    const row = await ctx.db.query("budgetState").first();
    if (!row) {
      // No singleton yet → zeros with the frozen caps.
      return {
        totalSpentUsd: 0,
        totalCapUsd: BUDGET.TOTAL_CAP,
        daySpentUsd: 0,
        dayCapUsd: BUDGET.DAY_CAP,
        activeCalls: 0,
        maxConcurrent: BUDGET.MAX_CONCURRENT,
      };
    }
    // Roll the day bucket forward at read time so a stale day never inflates
    // today's spend in the UI. The stored row is reconciled lazily on write.
    const today = dayBucket(Date.now());
    const daySpentUsd = row.day === today ? row.daySpentUsd : 0;
    return {
      totalSpentUsd: row.totalSpentUsd,
      totalCapUsd: BUDGET.TOTAL_CAP,
      daySpentUsd,
      dayCapUsd: BUDGET.DAY_CAP,
      activeCalls: row.activeCalls,
      maxConcurrent: BUDGET.MAX_CONCURRENT,
    };
  },
});

/**
 * Add a call's reported cost to the budget. `day` is the YYYY-MM-DD bucket the
 * cost belongs to (caller passes it so accounting is stable w.r.t. the call's
 * own day). Resets the day bucket if it rolled over.
 */
export const addCost = internalMutation({
  args: { usd: v.number(), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addCostHelper(ctx, args.usd, args.day);
    return null;
  },
});

export const incActive = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await incActiveHelper(ctx);
    return null;
  },
});

export const decActive = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await decActiveHelper(ctx);
    return null;
  },
});
