import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const TODAY = new Date().toISOString().slice(0, 10);

test("canStartCall: allowed=true for fresh visitor with no spend", async () => {
  const t = convexTest(schema, modules);
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res).toEqual({ allowed: true, reason: "ok" });
});

test("canStartCall: total_budget blocks when totalSpentUsd >= $40", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.budget.addCost, { usd: 40, day: TODAY });
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res).toEqual({ allowed: false, reason: "total_budget" });
});

test("canStartCall: daily_budget blocks when daySpentUsd >= $8", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.budget.addCost, { usd: 8, day: TODAY });
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res).toEqual({ allowed: false, reason: "daily_budget" });
});

test("canStartCall: total_budget takes precedence over daily_budget", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.budget.addCost, { usd: 40, day: TODAY });
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res.reason).toBe("total_budget");
});

test("canStartCall: visitor_cap blocks after 2 daily calls for the same visitor", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("visitorUsage", {
      visitorKey: "v1",
      day: TODAY,
      callsToday: 2,
    });
  });
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res).toEqual({ allowed: false, reason: "visitor_cap" });
});

test("canStartCall: visitor_cap is per-visitor — another visitor is still allowed", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("visitorUsage", {
      visitorKey: "v1",
      day: TODAY,
      callsToday: 2,
    });
  });
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v2" });
  expect(res).toEqual({ allowed: true, reason: "ok" });
});

test("canStartCall: concurrency blocks when activeCalls >= 3", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.budget.incActive, {});
  await t.mutation(internal.budget.incActive, {});
  await t.mutation(internal.budget.incActive, {});
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res).toEqual({ allowed: false, reason: "concurrency" });
});

test("canStartCall: day spend from a previous day does not count toward today", async () => {
  const t = convexTest(schema, modules);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await t.mutation(internal.budget.addCost, { usd: 8, day: yesterday });
  const res = await t.query(api.guard.canStartCall, { visitorKey: "v1" });
  expect(res).toEqual({ allowed: true, reason: "ok" });
});
