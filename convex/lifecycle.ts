/**
 * Wave A — client-callable call teardown.
 *
 * The VAPI end-of-call webhook is authoritative for cost + report, but it can lag.
 * `endCall` lets the browser release the concurrency slot immediately when the user
 * presses End (or a start fails), so a live slot never leaks while we wait for the
 * webhook. Idempotent: only acts on a still-"live" call.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const endCall = mutation({
  args: {
    callId: v.id("calls"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { callId, reason }) => {
    const call = await ctx.db.get(callId);
    if (!call || call.status !== "live") return null;

    const endedAt = Date.now();
    const durationSec = Math.max(0, Math.round((endedAt - call.startedAt) / 1000));

    await ctx.db.patch(callId, {
      status: "ended",
      endedAt,
      durationSec,
      // Outcome is refined by the webhook's end-of-call report; default to abandoned
      // for an immediate client teardown unless already set.
      outcome: call.outcome ?? "abandoned",
    });

    // Release the concurrency slot.
    const budget = await ctx.db.query("budgetState").first();
    if (budget && budget.activeCalls > 0) {
      await ctx.db.patch(budget._id, { activeCalls: budget.activeCalls - 1 });
    }
    return null;
  },
});
