/**
 * Wave A — Receptionist tool logic (plan.md §5.1 / §6).
 *
 * The three tools the VAPI assistant can call mid-call. These are the INTERNAL
 * implementations; the public-facing surface is the httpActions in http.ts,
 * which parse VAPI's tool-call envelope, invoke these, and respond first /
 * log after.
 *
 *   - lookupKnowledge   — keyword search over the business's chunks (internalQuery)
 *   - checkAvailability — deterministic slots from the business hours (internalQuery)
 *   - bookAppointment   — structured booking captured as a lead + on the call (internalMutation)
 *
 * All reads go through indexes / the search index — no `.filter()` for WHERE.
 * Args/results are the FROZEN contracts; we reuse them verbatim.
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

// ── check_availability ────────────────────────────────────────────────────────
//
// Deterministic, no clock-randomness: we derive a small fixed slate of slots
// from the requested date and the business hours. Good enough to demo tool
// calling + structured booking; a real calendar integration slots in later.
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

    // Sunday is treated as closed for the preset businesses (deterministic).
    // `args.date` is YYYY-MM-DD; parse as UTC midnight to avoid TZ drift.
    const dow = new Date(`${args.date}T00:00:00.000Z`).getUTCDay(); // 0 = Sun
    if (Number.isNaN(dow)) {
      return {
        available: false,
        date: args.date,
        slots: [],
        note: "Could not parse the requested date.",
      };
    }

    if (dow === 0) {
      return {
        available: false,
        date: args.date,
        slots: [],
        note: `Closed Sundays. Hours: ${business.profile.hours}`,
      };
    }

    // Fixed candidate slots (wall-clock "HH:mm" per the contract). If the caller
    // hinted a preferred time we surface it first so the demo feels responsive.
    const baseSlots = ["09:00", "11:30", "14:00", "16:30"];
    const slots = args.preferredTime
      ? [
          args.preferredTime,
          ...baseSlots.filter((s) => s !== args.preferredTime),
        ].slice(0, 4)
      : baseSlots;

    const note = args.service
      ? `Availability for ${args.service}. Hours: ${business.profile.hours}`
      : `Hours: ${business.profile.hours}`;

    return {
      available: true,
      date: args.date,
      slots,
      note,
    };
  },
});

// ── book_appointment ──────────────────────────────────────────────────────────
//
// Captures a structured booking. We persist it BOTH as a `leads` row (so the
// "closing the loop" lead wall sees it) and onto the most recent live call's
// `structuredData` for this business so the post-call report can render it.
// `idempotencyKey` makes a retried tool-call a no-op double-book.
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
    const liveCall =
      sortedByRecency.find((c) => c.status === "live") ?? null;
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

    const now = Date.now();
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
          },
        },
        outcome: "booked",
      });
    }

    return {
      booked: true,
      confirmationId: leadId,
      slot: args.slot,
      // The .ics is generated by the report layer from this confirmation; we
      // hand back a stable path the UI can resolve. (No file IO in a mutation.)
      icsUrl: `/api/ics/${leadId}`,
      message: `Booked ${args.service ?? "appointment"} for ${args.customerName} at ${args.slot}.`,
    };
  },
});
