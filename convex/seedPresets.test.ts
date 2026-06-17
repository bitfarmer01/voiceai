import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("ensurePresets: inserts 3 preset businesses on empty DB", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  expect(businesses).toHaveLength(3);
  const names = businesses.map((b) => b.name).sort();
  expect(names).toEqual(["Glow Dental", "Hale & Park Law", "Lux Salon"]);
});

test("ensurePresets: idempotent — running twice still yields 3 businesses", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  expect(businesses).toHaveLength(3);
});

test("ensurePresets: each business has the correct chunk count", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.seedPresets.ensurePresets, {});
  const businesses = await t.query(api.businesses.listPresets, {});
  const byName = Object.fromEntries(businesses.map((b) => [b.name, b.chunkCount]));
  expect(byName["Glow Dental"]).toBe(4);
  expect(byName["Lux Salon"]).toBe(4);
  expect(byName["Hale & Park Law"]).toBe(4);
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
