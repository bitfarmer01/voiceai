/**
 * Wave A — Receptionist tool logic.
 *
 * The three tools the VAPI assistant can call mid-call. These are the INTERNAL
 * implementations; the public-facing surface is the httpActions in http.ts,
 * which parse VAPI's tool-call envelope, invoke these, and respond first /
 * log after.
 *
 *   - lookupKnowledge   — keyword search over the business's chunks (internalQuery)
 *   - checkAvailability — the 2 soonest OPEN slots (hours grid minus the appointments calendar)
 *   - bookAppointment   — structured booking, VALIDATED against hours (internalMutation)
 *
 * All reads go through indexes / the search index — no `.filter()` for WHERE.
 * Args/results are the FROZEN contracts; we reuse them verbatim. Availability +
 * booking now parse `business.profile.hours` (convex/lib/hours.ts) and validate
 * against the real weekly schedule. When the hours text can't be confidently
 * parsed we DEGRADE GRACEFULLY — allow the action with a transparent note rather
 * than hard-blocking — so BYOD with messy hours is never worse than before.
 */
import { internalQuery, internalMutation } from "./_generated/server";
import {
  lookupKnowledgeArgs,
  lookupKnowledgeResult,
  checkAvailabilityArgs,
  checkAvailabilityResult,
  bookAppointmentArgs,
  bookAppointmentResult,
} from "./_contracts";
import { parseHours, isOpenOn, describeDay, type WeeklySchedule } from "./lib/hours";
import { CALENDAR_DAYS, dayGrid } from "./lib/calendarSeed";
import { nextOpenSlots } from "./lib/availability";
import { validateSlot } from "./lib/bookingSlot";
import { loadTaken, isSlotTaken, insertBookedAppointment, takenMessage } from "./calendar";

const DEFAULT_KNOWLEDGE_LIMIT = 4;

// ── lookup_knowledge ──────────────────────────────────────────────────────────
export const lookupKnowledge = internalQuery({
  args: lookupKnowledgeArgs,
  returns: lookupKnowledgeResult,
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_KNOWLEDGE_LIMIT, 10));

    const rows = await ctx.db
      .query("knowledgeChunks")
      .withSearchIndex("search_text", (q) =>
        q.search("text", args.query).eq("businessId", args.businessId),
      )
      .take(limit);

    const chunks = rows.map((r) => ({
      chunkId: r._id,
      text: r.text,
      tags: r.tags,
      // The search index returns rows in relevance order but no numeric score;
      // omit `score` rather than fabricate one (it's optional in the contract).
    }));

    return {
      found: chunks.length > 0,
      chunks,
    };
  },
});

// ── slot/date parsing helpers (lenient, V8-safe, no clock at module scope) ─────

/** A YYYY-MM-DD date (UTC). */
function isValidYmd(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return !Number.isNaN(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

// ── check_availability ────────────────────────────────────────────────────────
//
// The two soonest OPEN "YYYY-MM-DD HH:mm" slots: the hours grid minus the
// appointments calendar, from the requested date forward (14-day horizon),
// honoring a part-of-day / clock-time preference. A closed or full day rolls
// forward with a note that says why. Unparseable hours → generic grid + an
// honest "example times" note (taken slots are still subtracted).
export const checkAvailability = internalQuery({
  args: checkAvailabilityArgs,
  returns: checkAvailabilityResult,
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return { available: false, date: args.date, slots: [], note: "Business not found." };
    }
    if (!isValidYmd(args.date)) {
      return { available: false, date: args.date, slots: [], note: "Could not parse the requested date." };
    }

    const now = Date.now();
    const hoursText = business.profile.hours;
    const schedule: WeeklySchedule | null = parseHours(hoursText);
    const taken = await loadTaken(ctx, args.businessId, args.date, CALENDAR_DAYS);
    const slots = nextOpenSlots({
      grid: (d) => dayGrid(schedule, d),
      taken,
      fromDate: args.date,
      preferredTime: args.preferredTime,
      nowMs: now,
    });

    const notes: string[] = [];
    if (args.service) notes.push(`Availability for ${args.service}.`);

    if (slots.length === 0) {
      notes.push("No open times in the next two weeks. Offer to take a message.");
      return { available: false, date: args.date, slots: [], note: notes.join(" ") };
    }

    const firstDate = slots[0].slice(0, 10);
    if (firstDate !== args.date) {
      if (schedule && !isOpenOn(schedule, args.date)) {
        const dow = new Date(`${args.date}T00:00:00.000Z`).getUTCDay();
        notes.push(`We're ${describeDay(schedule, dow)} on ${args.date}.`);
      } else {
        notes.push(`Nothing open on ${args.date}${args.preferredTime ? ` for "${args.preferredTime}"` : ""}.`);
      }
      notes.push(`Next open: ${firstDate}.`);
    }
    notes.push("Offer exactly these times as a choice.");
    notes.push(
      schedule
        ? `Posted hours: ${hoursText}`
        : `These are example times — we couldn't verify them against the posted hours${hoursText ? ` ("${hoursText}")` : ""}. Please confirm when you call.`,
    );

    return { available: true, date: firstDate, slots, note: notes.join(" ") };
  },
});

// ── book_appointment ──────────────────────────────────────────────────────────
//
// Captures a structured booking. We persist it BOTH as a `leads` row (so the
// "closing the loop" lead wall sees it) and onto the most recent live call's
// `structuredData` for this business so the post-call report can render it.
// `idempotencyKey` makes a retried tool-call a no-op double-book.
//
// VALIDATION: the requested slot must carry a concrete time, is validated
// against the parsed hours, must land on the bookable 30-min grid (dayGrid —
// not just "within hours"), and must still be free on the calendar. A past
// datetime, a closed day, a time outside the open window, an off-grid time,
// an unreadable or date-only slot, or a slot the calendar already holds is
// rejected (booked:false + a plain-language message, NOTHING written) — a
// taken/off-grid slot's message names the two nearest open alternatives. When
// the hours can't be parsed we degrade-open and book it with a transparent
// note rather than blocking a real customer.
export const bookAppointment = internalMutation({
  args: bookAppointmentArgs,
  returns: bookAppointmentResult,
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return {
        booked: false,
        confirmationId: "",
        slot: args.slot,
        message: "Business not found; could not book.",
      };
    }

    const now = Date.now();
    const check = validateSlot(business.profile.hours, args.slot, now);
    if (!check.ok) {
      return { booked: false, confirmationId: "", slot: args.slot, message: check.message };
    }
    const degradeNote = check.degradeNote ?? null;

    // Find the call to attach the booking to. Indexed read on by_business, then
    // prefer the live one; fall back to the most recent call for this business
    // (leads.callId is a required FK, so we need a real call id).
    const businessCalls = await ctx.db
      .query("calls")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect();
    const sortedByRecency = [...businessCalls].sort(
      (a, b) => b.startedAt - a.startedAt,
    );
    const liveCall = sortedByRecency.find((c) => c.status === "live") ?? null;
    const anchorCall = liveCall ?? sortedByRecency[0] ?? null;

    if (!anchorCall) {
      // No call at all for this business — nothing to anchor the lead FK to.
      // This shouldn't happen during a real call; respond gracefully.
      return {
        booked: false,
        confirmationId: "",
        slot: args.slot,
        message: "No active call to attach the booking to.",
      };
    }

    // Idempotency: if a lead with this key already exists for the call, reuse it.
    const idempotencyKey = args.idempotencyKey;
    if (idempotencyKey) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_call", (q) => q.eq("callId", anchorCall._id))
        .collect();
      const prior = existing.find(
        (l) =>
          typeof l.request === "string" &&
          l.request.includes(`idem:${idempotencyKey}`),
      );
      if (prior) {
        return {
          booked: true,
          confirmationId: prior._id,
          slot: args.slot,
          message: "Appointment already booked (idempotent retry).",
        };
      }
    }

    // Off-grid guard: a time can satisfy the hours window (isWithinHours) but
    // still miss the 30-min grid the calendar actually renders/searches (e.g.
    // "09:15") — book it anyway and it becomes an invisible row that
    // getWindow/nextOpenSlots never surface, and on the degrade-path grid it
    // would accept any time on a day the generic grid doesn't cover at all.
    if (!dayGrid(parseHours(business.profile.hours), check.date).includes(check.time)) {
      return {
        booked: false,
        confirmationId: "",
        slot: args.slot,
        message: await takenMessage(ctx, business, check.date, check.time, now, "off-grid"),
      };
    }

    // Claim the calendar slot. Checked AFTER idempotency so a retry of our own
    // booking returns its confirmation instead of conflicting with itself.
    if (await isSlotTaken(ctx, args.businessId, check.date, check.time)) {
      return {
        booked: false,
        confirmationId: "",
        slot: args.slot,
        message: await takenMessage(ctx, business, check.date, check.time, now),
      };
    }

    const requestSummary = [
      `Booking ${args.service ?? "appointment"} for ${args.customerName} at ${args.slot}`,
      args.notes ? `Notes: ${args.notes}` : null,
      idempotencyKey ? `idem:${idempotencyKey}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    // Capture as a lead (this is the durable booking record).
    const leadId = await ctx.db.insert("leads", {
      callId: anchorCall._id,
      businessId: args.businessId,
      contact: args.contact,
      request: requestSummary,
      createdAt: now,
    });

    await insertBookedAppointment(ctx, {
      businessId: args.businessId,
      date: check.date,
      time: check.time,
      leadId,
      service: args.service,
      customerName: args.customerName,
    });

    // Mirror the structured booking onto the call so the report renders it.
    {
      await ctx.db.patch(anchorCall._id, {
        structuredData: {
          ...(typeof anchorCall.structuredData === "object" &&
          anchorCall.structuredData !== null
            ? (anchorCall.structuredData as Record<string, unknown>)
            : {}),
          booking: {
            confirmationId: leadId,
            slot: args.slot,
            customerName: args.customerName,
            contact: args.contact,
            service: args.service ?? null,
            notes: args.notes ?? null,
            bookedAt: now,
            ...(degradeNote ? { note: degradeNote } : {}),
          },
        },
        outcome: "booked",
      });
    }

    const baseMessage = `Booked ${args.service ?? "appointment"} for ${args.customerName} at ${args.slot}.`;
    return {
      booked: true,
      confirmationId: leadId,
      slot: args.slot,
      // The .ics is generated by the report layer from this confirmation; we
      // hand back a stable path the UI can resolve. (No file IO in a mutation.)
      icsUrl: `/api/ics/${leadId}`,
      message: degradeNote ? `${baseMessage} ${degradeNote}` : baseMessage,
    };
  },
});
