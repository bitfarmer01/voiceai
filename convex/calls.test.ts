import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const TODAY = new Date().toISOString().slice(0, 10);

async function seedAndGetBusinessId(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  if (businesses.length === 0) throw new Error("ensurePresets did not insert businesses");
  return businesses[0]._id;
}

async function startOne(
  t: ReturnType<typeof convexTest>,
  businessId: string,
  visitorKey: string,
  suffix = "",
) {
  return t.mutation(api.calls.startCall, {
    sessionId: `session-${visitorKey}${suffix}`,
    businessId: businessId as any,
    visitorKey,
    sttProvider: "deepgram",
    ttsProvider: "vapi",
    llmProvider: "gpt-4o-mini",
  });
}

test("startCall: inserts a call row and bumps activeCalls", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  const callId = await startOne(t, businessId, "v1");
  expect(callId).toBeTruthy();
  const count = await t.query(api.calls.activeCount, {});
  expect(count).toBe(1);
});

test("startCall: no per-visitor daily cap — the same visitor can start multiple calls", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);

  await startOne(t, businessId, "v1", "-a");
  await startOne(t, businessId, "v1", "-b");
  // Pre-removal this third call threw call_blocked:visitor_cap; now it succeeds
  // (still bounded only by the concurrency cap of 3).
  const third = await startOne(t, businessId, "v1", "-c");
  expect(third).toBeTruthy();

  const count = await t.query(api.calls.activeCount, {});
  expect(count).toBe(3);
});

test("startCall: different visitors can each start calls", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);

  await startOne(t, businessId, "v1", "-a");
  await startOne(t, businessId, "v1", "-b");

  const callId = await startOne(t, businessId, "v2", "-a");
  expect(callId).toBeTruthy();
});

test("startCall: throws call_blocked:concurrency at 3 active calls", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);

  await startOne(t, businessId, "visitor-0");
  await startOne(t, businessId, "visitor-1");
  await startOne(t, businessId, "visitor-2");

  await expect(startOne(t, businessId, "visitor-3")).rejects.toThrow(
    "call_blocked:concurrency",
  );
  const count = await t.query(api.calls.activeCount, {});
  expect(count).toBe(3);
});

test("startCall: throws call_blocked:daily_budget when day cap hit", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  await t.mutation(internal.budget.addCost, { usd: 8, day: TODAY });

  await expect(startOne(t, businessId, "v1")).rejects.toThrow(
    "call_blocked:daily_budget",
  );
  const count = await t.query(api.calls.activeCount, {});
  expect(count).toBe(0);
});

test("startCall: throws call_blocked:total_budget when global cap hit", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedAndGetBusinessId(t);
  await t.mutation(internal.budget.addCost, { usd: 40, day: TODAY });

  await expect(startOne(t, businessId, "v1")).rejects.toThrow(
    "call_blocked:total_budget",
  );
});

test("startCall: throws business_not_found for unknown businessId", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const fakeId = "j57e1hd3k4q0nzxw7g2rv5bn8" as any;

  await expect(
    t.mutation(api.calls.startCall, {
      sessionId: "s1",
      businessId: fakeId,
      visitorKey: "v1",
      sttProvider: "deepgram",
      ttsProvider: "vapi",
      llmProvider: "gpt-4o-mini",
    }),
  ).rejects.toThrow();
});
