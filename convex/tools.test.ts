import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

// Tests are written against June 2026 dates; pin "now" to Saturday 2026-06-20 so
// they don't rot as the real clock moves. Only Date is faked (promises stay real).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

// Seeding fills the calendar with ~40% sample bookings; tests start from an empty one
// and add exactly the rows they need.
async function clearCalendar(t: ReturnType<typeof convexTest>): Promise<void> {
  await t.run(async (ctx) => {
    for (const r of await ctx.db.query("appointments").collect()) await ctx.db.delete(r._id);
  });
}

// The first preset the seed produces is Glow Dental
// (hours "Mon–Fri 8:00–17:00, Sat 9:00–13:00"). Validation below is keyed to it.
async function seededBusinessId(
  t: ReturnType<typeof convexTest>,
): Promise<Id<"businesses">> {
  await t.mutation(internal.seed.seed, {});
  await clearCalendar(t);
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

async function takeSlot(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
  date: string,
  time: string,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("appointments", { businessId, date, time, source: "sample" });
  });
}

describe("check_availability", () => {
  // Glow: Mon–Fri 08:00–17:00, Sat 09:00–13:00, closed Sunday. 2026-06-22 is a Monday.
  test("returns the two soonest open slots as full 'YYYY-MM-DD HH:mm' strings", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "2026-06-22" });
    expect(res.available).toBe(true);
    expect(res.date).toBe("2026-06-22");
    expect(res.slots).toEqual(["2026-06-22 08:00", "2026-06-22 08:30"]);
  });

  test("skips slots already on the calendar", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    await takeSlot(t, businessId, "2026-06-22", "08:00");
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "2026-06-22" });
    expect(res.slots).toEqual(["2026-06-22 08:30", "2026-06-22 09:00"]);
  });

  test("honors a part-of-day preference", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-22",
      preferredTime: "afternoon",
    });
    expect(res.slots).toEqual(["2026-06-22 12:00", "2026-06-22 12:30"]);
  });

  test("a closed day returns next-open-day alternatives with a note naming the closure", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "2026-06-21" });
    expect(res.available).toBe(true);
    expect(res.date).toBe("2026-06-22");
    expect(res.slots[0]).toBe("2026-06-22 08:00");
    expect(res.note).toMatch(/closed Sunday/i);
    expect(res.note).toMatch(/Next open: 2026-06-22/);
  });

  test("a fully booked day rolls to the next day", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    for (let m = 8 * 60; m < 17 * 60; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      await takeSlot(t, businessId, "2026-06-22", `${hh}:${m % 60 === 0 ? "00" : "30"}`);
    }
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "2026-06-22" });
    expect(res.slots[0]).toBe("2026-06-23 08:00");
    expect(res.note).toMatch(/Nothing open on 2026-06-22/);
  });

  test("excludes times already past today", async () => {
    vi.setSystemTime(new Date("2026-06-22T10:10:00.000Z"));
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "2026-06-22" });
    expect(res.slots[0]).toBe("2026-06-22 10:30");
  });

  test("unparseable hours still subtract taken slots and say the times are examples", async () => {
    const t = convexTest(schema, modules);
    const businessId = await t.run(async (ctx) =>
      ctx.db.insert("businesses", {
        kind: "configured",
        name: "Vague Co",
        profile: { companyName: "Vague Co", hours: "call us to check", services: [], policies: [], availability: "" },
        chunkCount: 0,
        createdAt: Date.now(),
      }),
    );
    await takeSlot(t, businessId, "2026-06-22", "09:00");
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "2026-06-22" });
    expect(res.slots).toEqual(["2026-06-22 11:30", "2026-06-22 14:00"]);
    expect(res.note).toMatch(/example times/i);
  });

  test("guards the NaN/bad-date case", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.checkAvailability, { businessId, date: "not-a-date" });
    expect(res.available).toBe(false);
    expect(res.slots).toEqual([]);
  });
});

describe("patchOfferedSlots", () => {
  test("records the offered slots on the live voice call only", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const callId = await liveCallFor(t, businessId);
    await t.mutation(internal.calls.patchOfferedSlots, {
      businessId,
      slots: ["2026-06-22 08:00", "2026-06-22 08:30"],
    });
    const call = await t.run(async (ctx) => ctx.db.get(callId));
    expect((call?.structuredData as { offeredSlots?: string[] }).offeredSlots).toEqual([
      "2026-06-22 08:00",
      "2026-06-22 08:30",
    ]);
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
