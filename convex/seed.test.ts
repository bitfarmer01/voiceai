import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

// convex-test loads every function module for the mock backend.
const modules = import.meta.glob("./**/*.ts");

describe("seed conforms to the frozen schema", () => {
  test("populates all seeded tables with valid rows", async () => {
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

    // Row-count invariants (mirror convex/seed.ts).
    expect(businesses).toHaveLength(3);
    expect(chunks).toHaveLength(12); // 4 chunks × 3 presets
    expect(providerStats).toHaveLength(8);
    expect(calls).toHaveLength(3); // 3 demo calls — one per preset/outcome
    expect(budget).toHaveLength(1); // singleton

    // Referential integrity: every call's businessId is a real business.
    const businessIds = new Set(businesses.map((b) => b._id));
    for (const call of calls) {
      expect(businessIds.has(call.businessId)).toBe(true);
    }

    // providerStats kinds are within the frozen ProviderKind enum.
    for (const s of providerStats) {
      expect(["stt", "tts", "llm"]).toContain(s.kind);
      expect(["native", "custom"]).toContain(s.source);
    }
  });

  test("is idempotent — re-running yields identical row counts", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seed, {});
    await t.mutation(internal.seed.seed, {});
    const calls = await t.run((ctx) => ctx.db.query("calls").collect());
    expect(calls).toHaveLength(3); // clear-then-insert, not append
  });
});
