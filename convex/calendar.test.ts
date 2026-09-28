import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z")); // Saturday
});
afterEach(() => {
  vi.useRealTimers();
});

async function insertBusiness(
  t: ReturnType<typeof convexTest>,
  hours = "Mon–Fri 9am–5pm",
  extra: { expiresAt?: number } = {},
): Promise<Id<"businesses">> {
  return t.run(async (ctx) =>
    ctx.db.insert("businesses", {
      kind: "configured",
      name: "Cal Test",
      profile: { companyName: "Cal Test", hours, services: ["Cleaning", "Whitening"], policies: [], availability: "" },
      chunkCount: 0,
      createdAt: Date.now(),
      ...extra,
    }),
  );
}

// t.run's ctx.db only exposes system indexes, so filter in JS here.
async function rowsFor(t: ReturnType<typeof convexTest>, businessId: Id<"businesses">) {
  const all = await t.run(async (ctx) => ctx.db.query("appointments").collect());
  return all.filter((r) => r.businessId === businessId);
}

describe("ensureSeeded", () => {
  test("seeds ~40% of the next 14 days inside the hours, idempotently", async () => {
    const t = convexTest(schema, modules);
    const id = await insertBusiness(t);
    const n = await t.mutation(internal.calendar.ensureSeeded, { businessId: id });
    // Mon–Fri 9–5 = 16 slots × 10 weekdays in [06-20, 07-04)
    expect(n / 160).toBeGreaterThan(0.3);
    expect(n / 160).toBeLessThan(0.5);
    const rows = await rowsFor(t, id);
    expect(rows).toHaveLength(n);
    for (const r of rows) {
      expect(r.source).toBe("sample");
      expect(r.time >= "09:00" && r.time < "17:00").toBe(true);
      expect([0, 6]).not.toContain(new Date(`${r.date}T00:00:00Z`).getUTCDay());
    }
    expect(await t.mutation(internal.calendar.ensureSeeded, { businessId: id })).toBe(0);
  });

  test("unparseable hours seed on the generic weekday grid", async () => {
    const t = convexTest(schema, modules);
    const id = await insertBusiness(t, "call us to check");
    await t.mutation(internal.calendar.ensureSeeded, { businessId: id });
    for (const r of await rowsFor(t, id)) {
      expect(["09:00", "11:30", "14:00", "16:30"]).toContain(r.time);
    }
  });
});

describe("rollForward", () => {
  test("prunes past sample rows, keeps past booked rows, tops up, and skips expired businesses", async () => {
    const t = convexTest(schema, modules);
    const live = await insertBusiness(t);
    const expired = await insertBusiness(t, "Mon–Fri 9am–5pm", { expiresAt: Date.now() - 1 });
    await t.run(async (ctx) => {
      await ctx.db.insert("appointments", { businessId: live, date: "2026-06-19", time: "09:00", source: "sample" });
      await ctx.db.insert("appointments", { businessId: live, date: "2026-06-19", time: "10:00", source: "booked" });
    });

    const res = await t.mutation(internal.calendar.rollForward, {});
    expect(res.pruned).toBe(1);
    const liveRows = await rowsFor(t, live);
    expect(liveRows.some((r) => r.date === "2026-06-19" && r.source === "sample")).toBe(false);
    expect(liveRows.some((r) => r.date === "2026-06-19" && r.source === "booked")).toBe(true);
    expect(liveRows.length).toBeGreaterThan(1);
    expect(await rowsFor(t, expired)).toHaveLength(0);

    const again = await t.mutation(internal.calendar.rollForward, {});
    expect(again).toEqual({ seeded: 0, pruned: 0 });
  });
});

describe("getWindow", () => {
  test("returns 14 days with open/booked/mine statuses and hides other people's names", async () => {
    const t = convexTest(schema, modules);
    const id = await insertBusiness(t);
    const leadIds = await t.run(async (ctx) => {
      const callId = await ctx.db.insert("calls", {
        sessionId: "s", businessId: id, businessName: "Cal Test", status: "ended", startedAt: 0, durationSec: 0,
        costUsd: 0, costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 }, sttProvider: "x", ttsProvider: "x",
        llmProvider: "x", languages: [],
      });
      const mine = await ctx.db.insert("leads", { callId, businessId: id, contact: "a", request: "r", createdAt: 0 });
      const other = await ctx.db.insert("leads", { callId, businessId: id, contact: "b", request: "r", createdAt: 0 });
      await ctx.db.insert("appointments", { businessId: id, date: "2026-06-22", time: "09:00", source: "booked", leadId: mine, service: "Cleaning", customerFirstName: "Sam" });
      await ctx.db.insert("appointments", { businessId: id, date: "2026-06-22", time: "09:30", source: "booked", leadId: other, service: "Whitening", customerFirstName: "Alex" });
      return { mine };
    });

    const w = await t.query(api.calendar.getWindow, { businessId: id, from: "2026-06-20", highlightLeadId: leadIds.mine });
    expect(w?.hoursKnown).toBe(true);
    expect(w?.days).toHaveLength(14);
    expect(w?.days[0]).toEqual({ date: "2026-06-20", open: false, slots: [] });
    const mon = w!.days[2];
    expect(mon.slots[0]).toEqual({ time: "09:00", status: "mine", service: "Cleaning", firstName: "Sam" });
    expect(mon.slots[1]).toEqual({ time: "09:30", status: "booked", service: "Whitening" });
    expect(mon.slots[2]).toEqual({ time: "10:00", status: "open" });
  });

  test("returns null for a missing business", async () => {
    const t = convexTest(schema, modules);
    const id = await insertBusiness(t);
    await t.run(async (ctx) => ctx.db.delete(id));
    expect(await t.query(api.calendar.getWindow, { businessId: id, from: "2026-06-20" })).toBeNull();
  });
});

describe("seeding on create", () => {
  test("the preset seed gives every preset a calendar", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seed, {});
    const all = await t.run(async (ctx) => ctx.db.query("appointments").collect());
    expect(all.length).toBeGreaterThan(0);
  });
});
