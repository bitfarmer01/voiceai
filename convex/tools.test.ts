import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

// The first preset the seed produces is Glow Dental
// (hours "Mon–Fri 8:00–17:00, Sat 9:00–13:00"). Validation below is keyed to it.
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

// Insert a LIVE call so bookAppointment exercises its production live-call
// selection branch (not the ended-call fallback).
async function liveCallFor(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
): Promise<Id<"calls">> {
  return t.run(async (ctx) =>
    ctx.db.insert("calls", {
      sessionId: "test_live_session",
      businessId,
      businessName: "Test Business",
      status: "live",
      startedAt: Date.now(),
      durationSec: 0,
      costUsd: 0,
      costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
      sttProvider: "Deepgram Flux",
      ttsProvider: "Cartesia Sonic-3",
      llmProvider: "GPT-4o mini",
      languages: ["en"],
    }),
  );
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
  test("returns REAL slots within the open window on a weekday", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // 2026-06-22 is a Monday → Glow open 08:00–17:00.
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-22",
    });
    expect(res.available).toBe(true);
    expect(res.slots.length).toBeGreaterThan(0);
    // Real slots start at the open time (08:00), not the old fictional 09:00.
    expect(res.slots[0]).toBe("08:00");
  });

  test("is closed on Sunday with a note naming the real hours", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // 2026-06-14 is a Sunday — Glow never lists Sunday → closed.
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-14",
    });
    expect(res.available).toBe(false);
    expect(res.slots).toHaveLength(0);
    expect(res.note).toMatch(/Sunday/i);
  });

  test("honors a preferredTime only when it falls inside the open window", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // Monday, Glow 08:00–17:00. 10:00 is in-window → surfaced first.
    const inHours = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-22",
      preferredTime: "10:00",
    });
    expect(inHours.slots[0]).toBe("10:00");

    // 20:00 is outside the window → NOT surfaced; real slots returned instead.
    const outOfHours = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-22",
      preferredTime: "20:00",
    });
    expect(outOfHours.slots).not.toContain("20:00");
    expect(outOfHours.slots[0]).toBe("08:00");
  });

  test("guards the NaN/bad-date case", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "not-a-date",
    });
    expect(res.available).toBe(false);
    expect(res.slots).toHaveLength(0);
  });
});

describe("book_appointment — validation against real hours", () => {
  test("books a valid future in-hours slot and is idempotent on the same key", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const liveCallId = await liveCallFor(t, businessId);

    // 2026-06-22 (future Monday) 09:00 — inside Glow's 08:00–17:00 window.
    const first = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-22 09:00",
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
      slot: "2026-06-22 09:00",
      customerName: "Test Caller",
      contact: "test@example.com",
      idempotencyKey: "abc-123",
    });
    expect(second.booked).toBe(true);
    // Idempotent retry reuses the same confirmation.
    expect(second.confirmationId).toBe(first.confirmationId);
  });

  test("rejects a closed day and persists NOTHING", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    await liveCallFor(t, businessId);

    // 2026-06-21 is a Sunday — Glow is closed.
    const res = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-21 10:00",
      customerName: "Test Caller",
      contact: "test@example.com",
    });
    expect(res.booked).toBe(false);
    expect(res.message).toMatch(/closed|Sunday/i);

    const leads = await t.run((ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(0);
  });

  test("rejects a time outside the open window", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    await liveCallFor(t, businessId);

    // 2026-06-22 (Monday) 20:00 — after Glow's 17:00 close.
    const res = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-22 20:00",
      customerName: "Test Caller",
      contact: "test@example.com",
    });
    expect(res.booked).toBe(false);
    expect(res.message).toMatch(/outside our hours/i);

    const leads = await t.run((ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(0);
  });

  test("rejects a past datetime", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    await liveCallFor(t, businessId);

    // 2020-01-06 was a Monday — in-hours, but firmly in the past.
    const res = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2020-01-06 09:00",
      customerName: "Test Caller",
      contact: "test@example.com",
    });
    expect(res.booked).toBe(false);
    expect(res.message).toMatch(/past/i);

    const leads = await t.run((ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(0);
  });

  test("accepts the legacy ISO slot shape for an in-hours future slot", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    await liveCallFor(t, businessId);

    // ISO with trailing Z — the HH:mm is taken at face value (09:00 in-window).
    const res = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-22T09:00:00.000Z",
      customerName: "Test Caller",
      contact: "test@example.com",
    });
    expect(res.booked).toBe(true);
  });

  // ── Probe fix #3: am/pm slot times (no colon) must be parsed, not dropped ──
  test("rejects an am/pm slot string that is outside the open window", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    await liveCallFor(t, businessId);

    // 2026-06-22 (Monday) "8pm" → 20:00, past Glow's 17:00 close. Before the fix
    // "8pm" (no colon) didn't parse → treated as date-only → wrongly booked.
    const res = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-22 8pm",
      customerName: "Test Caller",
      contact: "test@example.com",
    });
    expect(res.booked).toBe(false);
    expect(res.message).toMatch(/outside our hours/i);

    const leads = await t.run((ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(0);
  });

  // ── Probe fix #2: a same-day, date-only booking must NOT be rejected as past ──
  test("allows a same-day date-only slot (time settled on the call)", async () => {
    vi.useFakeTimers();
    // Monday afternoon — Glow is open; the date-only slot is "today".
    vi.setSystemTime(new Date("2026-06-22T15:00:00.000Z"));
    try {
      const t = convexTest(schema, modules);
      const businessId = await seededBusinessId(t);
      await liveCallFor(t, businessId);

      const res = await t.mutation(internal.tools.bookAppointment, {
        businessId,
        slot: "2026-06-22", // today, no time
        customerName: "Test Caller",
        contact: "test@example.com",
      });
      expect(res.booked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
