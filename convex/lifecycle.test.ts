/**
 * Split-brain call-finalization accounting (F2).
 *
 * Cost + concurrency are finalized in TWO places that must agree no matter the
 * teardown order:
 *   - lifecycle.endCall  (client presses End; cost unknown ⇒ release slot only)
 *   - calls.recordEndOfCall (VAPI webhook; carries the authoritative cost)
 *
 * Invariants (encoded as assertions below):
 *   1. Cost is added to budgetState.totalSpentUsd EXACTLY ONCE per call, in ANY
 *      teardown order — INCLUDING the previously-broken case where the client's
 *      endCall runs BEFORE the webhook (the dropped-cost regression).
 *   2. activeCalls is decremented EXACTLY ONCE per call whether teardown is
 *      endCall-only, webhook-only, or both (any order); never below 0.
 *   3. A duplicate end-of-call webhook does NOT double-count cost or
 *      double-decrement concurrency.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const COST_BREAKDOWN = { stt: 0.02, llm: 0.03, tts: 0.01, platform: 0.04 } as const;
const CALL_COST = 0.1; // matches the breakdown total; the budget sums args.costUsd

async function seedAndGetBusinessId(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  if (businesses.length === 0) {
    throw new Error("ensurePresets did not insert businesses");
  }
  return businesses[0]._id;
}

/** Start a live call and attach a vapiCallId so the webhook can find it. */
async function startCallWithVapiId(
  t: ReturnType<typeof convexTest>,
  businessId: string,
  visitorKey: string,
  vapiCallId: string,
) {
  const callId = await t.mutation(api.calls.startCall, {
    sessionId: `session-${vapiCallId}`,
    businessId: businessId as Id<"businesses">,
    visitorKey,
    sttProvider: "deepgram",
    ttsProvider: "vapi",
    llmProvider: "gpt-4o-mini",
  });
  await t.mutation(api.calls.attachVapiId, { callId, vapiCallId });
  return callId;
}

async function webhookEnd(
  t: ReturnType<typeof convexTest>,
  vapiCallId: string,
) {
  await t.mutation(internal.calls.recordEndOfCall, {
    vapiCallId,
    durationSec: 42,
    costUsd: CALL_COST,
    costBreakdown: { ...COST_BREAKDOWN },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 1 — the dropped-cost regression. Client endCall runs BEFORE the
// webhook. PRE-FIX this skipped addCostHelper and totalSpentUsd stayed 0.
// ─────────────────────────────────────────────────────────────────────────────
test("client endCall THEN webhook: cost IS recorded (dropped-cost regression)", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  const callId = await startCallWithVapiId(t, businessId, "v1", "vapi-1");

  // Client tears down first (status → ended, concurrency released).
  await t.mutation(api.lifecycle.endCall, { callId, reason: "user_hangup" });

  let budget = await t.query(api.budget.getPublicState, {});
  // Cost is unknown at client teardown — must still be 0 here.
  expect(budget.totalSpentUsd).toBe(0);
  expect(budget.activeCalls).toBe(0);

  // Webhook arrives later with the authoritative cost.
  await webhookEnd(t, "vapi-1");

  budget = await t.query(api.budget.getPublicState, {});
  // THE FIX: cost must now be present (this assertion fails pre-fix — it was 0).
  expect(budget.totalSpentUsd).toBeCloseTo(CALL_COST, 6);
  expect(budget.daySpentUsd).toBeCloseTo(CALL_COST, 6);
  // Concurrency released exactly once — still 0, not -1.
  expect(budget.activeCalls).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 1 (mirror) — webhook BEFORE client endCall. Cost recorded once;
// the later endCall must not double-decrement concurrency below 0.
// ─────────────────────────────────────────────────────────────────────────────
test("webhook THEN client endCall: cost recorded once, concurrency not driven negative", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  const callId = await startCallWithVapiId(t, businessId, "v1", "vapi-2");

  await webhookEnd(t, "vapi-2");

  let budget = await t.query(api.budget.getPublicState, {});
  expect(budget.totalSpentUsd).toBeCloseTo(CALL_COST, 6);
  expect(budget.activeCalls).toBe(0);

  // Client endCall arrives after the webhook already set status → ended.
  // endCall early-returns on a non-"live" call, so this is a strict no-op.
  await t.mutation(api.lifecycle.endCall, { callId, reason: "late" });

  budget = await t.query(api.budget.getPublicState, {});
  expect(budget.totalSpentUsd).toBeCloseTo(CALL_COST, 6); // still once
  expect(budget.activeCalls).toBe(0); // never negative
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 3 — a DUPLICATE end-of-call webhook (the reason `alreadyEnded`
// existed) must not double-count cost or double-decrement concurrency.
// ─────────────────────────────────────────────────────────────────────────────
test("duplicate webhook: cost counted once, concurrency decremented once", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  await startCallWithVapiId(t, businessId, "v1", "vapi-3");

  await webhookEnd(t, "vapi-3");
  await webhookEnd(t, "vapi-3"); // retried/duplicate webhook

  const budget = await t.query(api.budget.getPublicState, {});
  expect(budget.totalSpentUsd).toBeCloseTo(CALL_COST, 6); // NOT 2×
  expect(budget.daySpentUsd).toBeCloseTo(CALL_COST, 6);
  expect(budget.activeCalls).toBe(0); // NOT -1
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 2 — webhook-only teardown decrements concurrency exactly once and
// records cost exactly once.
// ─────────────────────────────────────────────────────────────────────────────
test("webhook-only teardown: concurrency released once, cost recorded once", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  await startCallWithVapiId(t, businessId, "v1", "vapi-4");

  let budget = await t.query(api.budget.getPublicState, {});
  expect(budget.activeCalls).toBe(1);

  await webhookEnd(t, "vapi-4");

  budget = await t.query(api.budget.getPublicState, {});
  expect(budget.activeCalls).toBe(0);
  expect(budget.totalSpentUsd).toBeCloseTo(CALL_COST, 6);
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 2 — endCall-only teardown releases the slot exactly once and never
// records cost (cost is unknown without the webhook).
// ─────────────────────────────────────────────────────────────────────────────
test("endCall-only teardown: concurrency released once, no cost recorded", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  const callId = await startCallWithVapiId(t, businessId, "v1", "vapi-5");

  await t.mutation(api.lifecycle.endCall, { callId, reason: "user_hangup" });

  const budget = await t.query(api.budget.getPublicState, {});
  expect(budget.activeCalls).toBe(0);
  expect(budget.totalSpentUsd).toBe(0); // no webhook ⇒ no cost
});

// ─────────────────────────────────────────────────────────────────────────────
// Multiple concurrent calls — independent finalization, cost summed exactly
// once per call across mixed teardown orders; concurrency lands back at 0.
// ─────────────────────────────────────────────────────────────────────────────
test("two calls, mixed teardown order: each cost counted once, activeCalls returns to 0", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);

  const callA = await startCallWithVapiId(t, businessId, "vA", "vapi-A");
  const callB = await startCallWithVapiId(t, businessId, "vB", "vapi-B");

  let budget = await t.query(api.budget.getPublicState, {});
  expect(budget.activeCalls).toBe(2);

  // A: client endCall first, then webhook (the broken path).
  await t.mutation(api.lifecycle.endCall, { callId: callA, reason: "hangup" });
  await webhookEnd(t, "vapi-A");

  // B: webhook first, then a late client endCall (no-op).
  await webhookEnd(t, "vapi-B");
  await t.mutation(api.lifecycle.endCall, { callId: callB, reason: "late" });

  budget = await t.query(api.budget.getPublicState, {});
  expect(budget.totalSpentUsd).toBeCloseTo(CALL_COST * 2, 6);
  expect(budget.activeCalls).toBe(0);
});
