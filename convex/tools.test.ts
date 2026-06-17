import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seededBusinessId(
  t: ReturnType<typeof convexTest>,
): Promise<Id<"businesses">> {
  await t.mutation(internal.seed.seed, {});
  const id = await t.run(async (ctx) => {
    // Collect all businesses and filter in JS — avoids the schema-typed
    // withIndex inside t.run's generic ctx.db (which only exposes system indexes).
    const all = await ctx.db.query("businesses").collect();
    const biz = all.find((b) => b.kind === "preset") ?? null;
    return biz?._id ?? null;
  });
  if (!id) throw new Error("seed produced no preset business");
  return id;
}

describe("lookup_knowledge", () => {
  test("returns grounded chunks for a matching query", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.lookupKnowledge, {
      businessId,
      query: "hours open",
    });
    expect(res.found).toBe(true);
    expect(Array.isArray(res.chunks)).toBe(true);
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(typeof res.chunks[0].text).toBe("string");
  });
});

describe("check_availability", () => {
  test("returns slots on a weekday", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // 2026-06-15 is a Monday.
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-15",
    });
    expect(res.available).toBe(true);
    expect(res.slots.length).toBeGreaterThan(0);
  });

  test("is closed on Sunday", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // 2026-06-14 is a Sunday.
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-14",
    });
    expect(res.available).toBe(false);
    expect(res.slots).toHaveLength(0);
  });
});

describe("book_appointment", () => {
  test("books and is idempotent on the same key", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);

    // Give the business a LIVE call so bookAppointment exercises its live-call
    // selection branch (the production path), not the ended-call fallback.
    const liveCallId = await t.run(async (ctx) =>
      ctx.db.insert("calls", {
        sessionId: "test_live_session",
        businessId,
        businessName: "Test Business",
        status: "live",
        startedAt: 1781611200000,
        durationSec: 0,
        costUsd: 0,
        costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
        sttProvider: "Deepgram Flux",
        ttsProvider: "Cartesia Sonic-3",
        llmProvider: "GPT-4o mini",
        languages: ["en"],
      }),
    );

    const first = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-15T09:00:00.000Z",
      customerName: "Test Caller",
      contact: "test@example.com",
      idempotencyKey: "abc-123",
    });
    expect(first.booked).toBe(true);
    expect(first.confirmationId).not.toBe("");

    const liveCall = await t.run((ctx) => ctx.db.get(liveCallId));
    expect(liveCall?.outcome).toBe("booked");

    const second = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-15T09:00:00.000Z",
      customerName: "Test Caller",
      contact: "test@example.com",
      idempotencyKey: "abc-123",
    });
    expect(second.booked).toBe(true);
    // Idempotent retry reuses the same confirmation.
    expect(second.confirmationId).toBe(first.confirmationId);
  });
});
