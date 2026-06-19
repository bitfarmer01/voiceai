/**
 * Wave A — Receptionist tool logic (plan.md §5.1 / §6).
 *
 * The three tools the VAPI assistant can call mid-call. These are the INTERNAL
 * implementations; the public-facing surface is the httpActions in http.ts,
 * which parse VAPI's tool-call envelope, invoke these, and respond first /
 * log after.
 *
 *   - lookupKnowledge   — keyword search over the business's chunks (internalQuery)
 *   - checkAvailability — REAL slots from the parsed business hours (internalQuery)
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
import {
  parseHours,
  isOpenOn,
  isWithinHours,
  slotsFor,
  describeDay,
  parseTimeToken,
  toHHMM,
  type WeeklySchedule,
} from "./lib/hours";

const DEFAULT_KNOWLEDGE_LIMIT = 4;

// Generic fallback slots used ONLY on the degrade path (hours unparseable).
// Same shape the old implementation always returned.
const GENERIC_SLOTS = ["09:00", "11:30", "14:00", "16:30"];

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

/**
 * Pull a `{ date, time }` out of a slot string, leniently. Accepts:
 *   - "YYYY-MM-DD HH:mm"            (space-separated wall clock)
 *   - "YYYY-MM-DDTHH:mm[:ss][.sss]" (ISO; optional trailing Z)
 *   - "YYYY-MM-DD" alone            (date only → time undefined)
 * Returns null when no YYYY-MM-DD date can be found. `time` is normalized to
 * "HH:mm" (24h) when present.
 *
 * NOTE on timezones: we treat the wall-clock time in the slot AS the business's
 * local time and compare it directly to the parsed (local) hours. We do NOT
 * convert ISO "Z" to a different zone — the slot's HH:mm is taken at face value.
 * This keeps availability and booking validation consistent with how slots are
 * generated (slotsFor emits bare "HH:mm") and avoids TZ drift in the demo.
 */
function parseSlot(slot: string): { date: string; time?: string } | null {
  if (typeof slot !== "string") return null;
  const trimmed = slot.trim();
  const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const date = dateMatch[1];
  if (!isValidYmd(date)) return null;

  // Find a time after the date. Accept 24h "HH:mm" (incl. ISO "T20:00:00Z")
  // AND 12h "8pm" / "1:30pm" (no colon) — the latter is what an LLM commonly
  // emits, and dropping it silently bypassed the hours check.
  const rest = trimmed.slice(trimmed.indexOf(date) + date.length);
  const timeMatch = rest.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})/i);
  if (!timeMatch) return { date };
  const mins = parseTimeToken(timeMatch[1].replace(/\s+/g, ""));
  if (mins === null) return { date };
  return { date, time: toHHMM(mins) };
}

/**
 * Is `{date,time}` in the past relative to `nowMs`? Compares as UTC wall-clock
 * (the same face-value convention parseSlot uses). A date-only slot is "past"
 * only if the whole day is before today (UTC).
 */
function isPastSlot(date: string, time: string | undefined, nowMs: number): boolean {
  const dayMs = new Date(`${date}T00:00:00.000Z`).getTime();
  if (time === undefined) {
    // Date-only: past only if the WHOLE day is before today (UTC) — a same-day
    // booking with the time still to be settled on the call must be allowed.
    const n = new Date(nowMs);
    const todayMs = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    return dayMs < todayMs;
  }
  const minutes = parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10);
  return dayMs + minutes * 60_000 < nowMs;
}

// ── check_availability ────────────────────────────────────────────────────────
//
// Parse the business hours and return REAL slots within the open window. On a
// closed day → available:false, slots:[], note naming the real hours. When the
// hours text can't be parsed → degrade: generic slots + a transparent note.
export const checkAvailability = internalQuery({
  args: checkAvailabilityArgs,
  returns: checkAvailabilityResult,
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return {
        available: false,
        date: args.date,
        slots: [],
        note: "Business not found.",
      };
    }

    // `args.date` is YYYY-MM-DD; guard the NaN-date case first (preserved).
    if (!isValidYmd(args.date)) {
      return {
        available: false,
        date: args.date,
        slots: [],
        note: "Could not parse the requested date.",
      };
    }

    const hoursText = business.profile.hours;
    const schedule: WeeklySchedule | null = parseHours(hoursText);

    // ── Degrade path: hours unparseable → don't hard-block, just be honest.
    if (!schedule) {
      const slots = args.preferredTime
        ? [args.preferredTime, ...GENERIC_SLOTS.filter((s) => s !== args.preferredTime)].slice(0, 4)
        : GENERIC_SLOTS;
      return {
        available: true,
        date: args.date,
        slots,
        note: `These are example times — we couldn't verify them against the posted hours${hoursText ? ` ("${hoursText}")` : ""}. Please confirm when you call.`,
      };
    }

    const dow = new Date(`${args.date}T00:00:00.000Z`).getUTCDay();

    // ── Closed day: name the real hours so the caller knows when we ARE open.
    if (!isOpenOn(schedule, args.date)) {
      return {
        available: false,
        date: args.date,
        slots: [],
        note: `We're ${describeDay(schedule, dow)} that day. Posted hours: ${hoursText}`,
      };
    }

    // ── Open day: REAL slots within the window.
    const realSlots = slotsFor(schedule, args.date, { stepMin: 30, max: 4 });

    // Honor a preferred time only if it actually falls within the open window.
    let slots = realSlots;
    if (args.preferredTime && isWithinHours(schedule, args.date, args.preferredTime)) {
      slots = [
        args.preferredTime,
        ...realSlots.filter((s) => s !== args.preferredTime),
      ].slice(0, 4);
    }

    const serviceNote = args.service ? `Availability for ${args.service}. ` : "";
    return {
      available: slots.length > 0,
      date: args.date,
      slots,
      note: `${serviceNote}${describeDay(schedule, dow)}. Posted hours: ${hoursText}`,
    };
  },
});

// ── book_appointment ──────────────────────────────────────────────────────────
//
// Captures a structured booking. We persist it BOTH as a `leads` row (so the
// "closing the loop" lead wall sees it) and onto the most recent live call's
// `structuredData` for this business so the post-call report can render it.
// `idempotencyKey` makes a retried tool-call a no-op double-book.
//
// VALIDATION (the fix): the requested slot is validated against the parsed
// hours BEFORE anything is persisted. A past datetime, a closed day, or a time
// outside the open window is rejected (booked:false + a plain-language message,
// NOTHING written). When the hours can't be parsed we degrade-open and book it
// with a transparent note rather than blocking a real customer.
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
    const schedule = parseHours(business.profile.hours);
    const parsed = parseSlot(args.slot);
    let degradeNote: string | null = null;

    // ── Validate the slot BEFORE persisting (only when we understand both the
    //    slot and the hours; otherwise degrade-open with a transparent note).
    if (!parsed) {
      // Couldn't read the slot at all → can't validate it. Degrade-open.
      degradeNote =
        "We couldn't read the requested time, so this is held as-is — please confirm it.";
    } else {
      // Past datetime is always invalid, even on the degrade path.
      if (isPastSlot(parsed.date, parsed.time, now)) {
        return {
          booked: false,
          confirmationId: "",
          slot: args.slot,
          message:
            "That time is in the past — please pick an upcoming date and time.",
        };
      }

      if (schedule) {
        const dow = new Date(`${parsed.date}T00:00:00.000Z`).getUTCDay();
        if (!isOpenOn(schedule, parsed.date)) {
          return {
            booked: false,
            confirmationId: "",
            slot: args.slot,
            message: `We're ${describeDay(schedule, dow)} that day, so we can't book then. Posted hours: ${business.profile.hours}`,
          };
        }
        // If a time was given, it must fall inside the open window. A date-only
        // slot on an open day is allowed (the time can be settled on the call).
        if (parsed.time && !isWithinHours(schedule, parsed.date, parsed.time)) {
          return {
            booked: false,
            confirmationId: "",
            slot: args.slot,
            message: `${parsed.time} is outside our hours — we're ${describeDay(schedule, dow)} that day. Posted hours: ${business.profile.hours}`,
          };
        }
      } else {
        // Hours unparseable → degrade-open with a transparent note (still
        // rejected the past-date case above).
        degradeNote = business.profile.hours
          ? "We couldn't verify this against the posted hours — please confirm it."
          : "No posted hours on file — please confirm this time.";
      }
    }

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
