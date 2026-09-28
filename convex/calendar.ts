/**
 * The sample calendar. `appointments` holds one row per TAKEN 30-min slot
 * ("sample" seeded demo bookings + real "booked" rows); open slots are the
 * hours grid minus those rows. The plain helpers below are shared by the
 * receptionist tools (convex/tools.ts) and the chat wrapper (convex/chat.ts) so
 * the conflict check and the booked-row insert happen inside the SAME mutation
 * as the lead — Convex's serializable transactions then prevent double-booking.
 */
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { calendarWindowResult, type CalendarWindow } from "./_contracts";
import { parseHours } from "./lib/hours";
import { isPastSlot } from "./lib/bookingSlot";
import { CALENDAR_DAYS, addDays, dayGrid, sampleSlots, todayYmd } from "./lib/calendarSeed";
import { nextOpenSlots } from "./lib/availability";

export function slotKey(date: string, time: string): string {
  return `${date} ${time}`;
}

/** Taken slot keys for [fromDate, fromDate + days). Indexed range read. */
export async function loadTaken(
  ctx: Pick<QueryCtx, "db">,
  businessId: Id<"businesses">,
  fromDate: string,
  days: number,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("appointments")
    .withIndex("by_business_date", (q) =>
      q.eq("businessId", businessId).gte("date", fromDate).lt("date", addDays(fromDate, days)),
    )
    .collect();
  return new Set(rows.map((r) => slotKey(r.date, r.time)));
}

export async function isSlotTaken(
  ctx: Pick<QueryCtx, "db">,
  businessId: Id<"businesses">,
  date: string,
  time: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("appointments")
    .withIndex("by_business_slot", (q) => q.eq("businessId", businessId).eq("date", date).eq("time", time))
    .first();
  return row !== null;
}

export async function insertBookedAppointment(
  ctx: Pick<MutationCtx, "db">,
  a: {
    businessId: Id<"businesses">;
    date: string;
    time: string;
    leadId: Id<"leads">;
    service?: string;
    customerName: string;
  },
): Promise<void> {
  const firstName = a.customerName.trim().split(/\s+/)[0];
  await ctx.db.insert("appointments", {
    businessId: a.businessId,
    date: a.date,
    time: a.time,
    source: "booked",
    leadId: a.leadId,
    ...(a.service ? { service: a.service } : {}),
    ...(firstName ? { customerFirstName: firstName } : {}),
  });
}

/** Idempotent top-up: inserts missing sample rows for today…today+13. Never touches booked rows. */
export async function seedCalendar(
  ctx: Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
  nowMs: number,
): Promise<number> {
  const business = await ctx.db.get(businessId);
  if (!business) return 0;
  const from = todayYmd(nowMs);
  const taken = await loadTaken(ctx, businessId, from, CALENDAR_DAYS);
  const schedule = parseHours(business.profile.hours);
  let inserted = 0;
  for (const s of sampleSlots(businessId, schedule, from, business.profile.services)) {
    if (taken.has(slotKey(s.date, s.time))) continue;
    await ctx.db.insert("appointments", {
      businessId,
      date: s.date,
      time: s.time,
      source: "sample",
      ...(s.service ? { service: s.service } : {}),
    });
    inserted++;
  }
  return inserted;
}

/** Drop every sample row for the business and reseed (hours may have changed). */
export async function resetSampleCalendar(
  ctx: Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
  nowMs: number,
): Promise<number> {
  const rows = await ctx.db
    .query("appointments")
    .withIndex("by_business_date", (q) => q.eq("businessId", businessId))
    .collect();
  for (const r of rows) {
    if (r.source === "sample") await ctx.db.delete(r._id);
  }
  return seedCalendar(ctx, businessId, nowMs);
}

/** Plain-language rejection naming the two nearest open alternatives. */
export async function takenMessage(
  ctx: Pick<QueryCtx, "db">,
  business: Doc<"businesses">,
  date: string,
  time: string,
  nowMs: number,
): Promise<string> {
  const schedule = parseHours(business.profile.hours);
  const taken = await loadTaken(ctx, business._id, date, CALENDAR_DAYS);
  const alts = nextOpenSlots({ grid: (d) => dayGrid(schedule, d), taken, fromDate: date, preferredTime: time, nowMs });
  return alts.length > 0
    ? `Sorry — ${date} ${time} is already taken. The nearest open times are ${alts.join(" or ")}. Offer these two as a choice.`
    : `Sorry — ${date} ${time} is already taken and nothing else is open in the next two weeks. Offer to take a message.`;
}

export const ensureSeeded = internalMutation({
  args: { businessId: v.id("businesses") },
  returns: v.number(),
  handler: async (ctx, args) => seedCalendar(ctx, args.businessId, Date.now()),
});

// Daily (convex/crons.ts): prune past sample rows, then top every live business up
// to 14 days ahead. Real (booked) rows are never deleted.
export const rollForward = internalMutation({
  args: {},
  returns: v.object({ seeded: v.number(), pruned: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const today = todayYmd(now);
    const past = await ctx.db
      .query("appointments")
      .withIndex("by_date", (q) => q.lt("date", today))
      .collect();
    let pruned = 0;
    for (const r of past) {
      if (r.source !== "sample") continue;
      await ctx.db.delete(r._id);
      pruned++;
    }

    // No WHERE clause — every business is a candidate; expiry is checked per row.
    const businesses = await ctx.db.query("businesses").collect();
    let seeded = 0;
    for (const b of businesses) {
      if (b.expiresAt !== undefined && b.expiresAt < now) continue;
      seeded += await seedCalendar(ctx, b._id, now);
    }
    return { seeded, pruned };
  },
});

// Reactive calendar for the UI. `highlightLeadId` marks the viewer's own booking
// ("mine") — the ONLY slot that carries a first name (no auth → no other PII).
export const getWindow = query({
  args: {
    businessId: v.id("businesses"),
    from: v.string(),
    days: v.optional(v.number()),
    highlightLeadId: v.optional(v.string()),
  },
  returns: v.union(v.null(), calendarWindowResult),
  handler: async (ctx, args): Promise<CalendarWindow | null> => {
    const business = await ctx.db.get(args.businessId);
    if (!business) return null;

    const now = Date.now();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(args.from) ? args.from : todayYmd(now);
    const days = Math.max(1, Math.min(Math.floor(args.days ?? CALENDAR_DAYS), CALENDAR_DAYS));
    const schedule = parseHours(business.profile.hours);

    const rows = await ctx.db
      .query("appointments")
      .withIndex("by_business_date", (q) =>
        q.eq("businessId", args.businessId).gte("date", from).lt("date", addDays(from, days)),
      )
      .collect();
    const byKey = new Map(rows.map((r) => [slotKey(r.date, r.time), r]));

    const out: CalendarWindow["days"] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      const grid = dayGrid(schedule, date);
      const slots = grid
        .filter((time) => !isPastSlot(date, time, now))
        .map((time) => {
          const r = byKey.get(slotKey(date, time));
          if (!r) return { time, status: "open" as const };
          const mine = r.leadId !== undefined && r.leadId === args.highlightLeadId;
          return {
            time,
            status: mine ? ("mine" as const) : ("booked" as const),
            ...(r.service ? { service: r.service } : {}),
            ...(mine && r.customerFirstName ? { firstName: r.customerFirstName } : {}),
          };
        });
      out.push({ date, open: grid.length > 0, slots });
    }
    return { hoursKnown: schedule !== null, days: out };
  },
});
