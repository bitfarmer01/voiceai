import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("ensurePresets: inserts 4 preset businesses on empty DB", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  expect(businesses).toHaveLength(4);
  const names = businesses.map((b) => b.name).sort();
  expect(names).toEqual([
    "Affordable Health Insurance of Central Florida",
    "Glow Dental",
    "Hale & Park Law",
    "Lux Salon",
  ]);
});

test("ensurePresets: idempotent — running twice still yields 4 businesses", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  expect(businesses).toHaveLength(4);
});

test("ensurePresets: each business has the correct chunk count", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  const byName = Object.fromEntries(businesses.map((b) => [b.name, b.chunkCount]));
  expect(byName["Glow Dental"]).toBe(4);
  expect(byName["Lux Salon"]).toBe(4);
  expect(byName["Hale & Park Law"]).toBe(4);
  expect(byName["Affordable Health Insurance of Central Florida"]).toBe(10);
});

test("ensurePresets: tops up chunks missing from an existing preset without duplicating", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const insurance = "Affordable Health Insurance of Central Florida";
  const chunkCount = async () =>
    t.run(async (ctx) => {
      const biz = (await ctx.db.query("businesses").collect()).find((b) => b.name === insurance)!;
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_business", (q) => q.eq("businessId", biz._id))
        .collect();
      return { stored: chunks.length, recorded: biz.chunkCount, chunks };
    });

  // Simulate a deployment seeded before the newer chunks existed.
  const before = await chunkCount();
  await t.run(async (ctx) => {
    for (const c of before.chunks.slice(4)) await ctx.db.delete(c._id);
  });
  expect((await chunkCount()).stored).toBe(4);

  await t.mutation(api.seedPresets.ensurePresets, {});
  await t.mutation(api.seedPresets.ensurePresets, {});
  const after = await chunkCount();
  expect(after.stored).toBe(10);
  expect(after.recorded).toBe(10);
});

test("ensurePresets: initializes budgetState singleton", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const budget = await t.query(api.budget.getPublicState, {});
  expect(budget.totalSpentUsd).toBe(0);
  expect(budget.activeCalls).toBe(0);
  expect(budget.totalCapUsd).toBe(40);
});

test("ensurePresets: does not reset budgetState if it already exists", async () => {
  const t = convexTest(schema, modules);
  const today = new Date().toISOString().slice(0, 10);
  await t.mutation(api.seedPresets.ensurePresets, {});
  await t.mutation(internal.budget.addCost, { usd: 5, day: today });

  await t.mutation(api.seedPresets.ensurePresets, {});
  const budget = await t.query(api.budget.getPublicState, {});
  expect(budget.totalSpentUsd).toBe(5);
});
