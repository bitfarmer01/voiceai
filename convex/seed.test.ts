import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

// convex-test loads every function module for the mock backend.
const modules = import.meta.glob("./**/*.ts");

describe("seed conforms to the frozen schema and writes NO fabricated data", () => {
  test("seeds only preset businesses + chunks + a zeroed budget", async () => {
    const t = convexTest(schema, modules);

    // If any insert violates schema, convexTest throws here.
    await t.mutation(internal.seed.seed, {});

    const { businesses, chunks, providerStats, calls, budget } = await t.run(
      async (ctx) => ({
        businesses: await ctx.db.query("businesses").collect(),
        chunks: await ctx.db.query("knowledgeChunks").collect(),
        providerStats: await ctx.db.query("providerStats").collect(),
        calls: await ctx.db.query("calls").collect(),
        budget: await ctx.db.query("budgetState").collect(),
      }),
    );

    // Preset product content IS seeded (real businesses a visitor talks to).
    expect(businesses).toHaveLength(3);
    expect(chunks).toHaveLength(12); // 4 chunks × 3 presets
    for (const b of businesses) {
      expect(b.kind).toBe("preset");
    }

    // REAL-DATA-ONLY: zero fabricated calls and zero fabricated provider stats.
    expect(calls).toHaveLength(0);
    expect(providerStats).toHaveLength(0);

    // budgetState is a single zeroed singleton — no fabricated spend.
    expect(budget).toHaveLength(1);
    expect(budget[0].totalSpentUsd).toBe(0);
    expect(budget[0].daySpentUsd).toBe(0);
    expect(budget[0].activeCalls).toBe(0);
  });

  test("is idempotent — re-running yields identical (zero-fake) state", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seed, {});
    await t.mutation(internal.seed.seed, {});

    const { businesses, calls, providerStats, budget } = await t.run(
      async (ctx) => ({
        businesses: await ctx.db.query("businesses").collect(),
        calls: await ctx.db.query("calls").collect(),
        providerStats: await ctx.db.query("providerStats").collect(),
        budget: await ctx.db.query("budgetState").collect(),
      }),
    );

    // clear-then-insert, not append.
    expect(businesses).toHaveLength(3);
    expect(calls).toHaveLength(0);
    expect(providerStats).toHaveLength(0);
    expect(budget).toHaveLength(1);
  });
});
