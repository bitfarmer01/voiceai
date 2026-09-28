/**
 * Public chat-facing wrappers. The text-twin chatbot (app/api/chat/route.ts)
 * cannot call internalQuery/internalMutation directly, so these thin PUBLIC
 * functions delegate to the FROZEN internal tools (convex/tools.ts) verbatim.
 * No business logic lives here except the booking ANCHOR: a text chat has no
 * voice call, but `leads.callId` is a required FK, so bookAppointment
 * find-or-creates a minimal channel:"chat" `calls` row for {businessId, sessionId}
 * and persists the booking DIRECTLY to that anchor — without routing through
 * internal.tools.bookAppointment, which prefers any live voice call and would
 * mis-attach a chat booking.
 */
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  lookupKnowledgeArgs,
  lookupKnowledgeResult,
  type LookupKnowledgeResult,
  checkAvailabilityArgs,
  checkAvailabilityResult,
  type CheckAvailabilityResult,
  bookAppointmentResult,
  type BookAppointmentResult,
} from "./_contracts";
import { validateSlot } from "./lib/bookingSlot";
import { isSlotTaken, insertBookedAppointment, takenMessage } from "./calendar";
import { parseHours } from "./lib/hours";
import { dayGrid } from "./lib/calendarSeed";

export const lookupKnowledge = query({
  args: lookupKnowledgeArgs,
  returns: lookupKnowledgeResult,
  handler: async (ctx, args): Promise<LookupKnowledgeResult> =>
    ctx.runQuery(internal.tools.lookupKnowledge, args),
});

export const checkAvailability = query({
  args: checkAvailabilityArgs,
  returns: checkAvailabilityResult,
  handler: async (ctx, args): Promise<CheckAvailabilityResult> =>
    ctx.runQuery(internal.tools.checkAvailability, args),
});

export const bookAppointment = mutation({
  args: {
    businessId: v.id("businesses"),
    sessionId: v.string(),
    slot: v.string(),
    customerName: v.string(),
    contact: v.string(),
    service: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: bookAppointmentResult,
  handler: async (ctx, args): Promise<BookAppointmentResult> => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return { booked: false, confirmationId: "", slot: args.slot, message: "Business not found." };
    }

    // Find-or-create the chat anchor for this session (so leads.callId resolves).
    // We look up the anchor AFTER any insert to guarantee we have the doc with its _id.
    let anchor = await ctx.db
      .query("calls")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("channel"), "chat"))
      .first();
    if (!anchor) {
      const now = Date.now();
      const anchorId = await ctx.db.insert("calls", {
        sessionId: args.sessionId,
        businessId: args.businessId,
        businessName: business.name,
        status: "ended",
        channel: "chat",
        startedAt: now,
        endedAt: now,
        durationSec: 0,
        costUsd: 0,
        costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
        sttProvider: "text",
        ttsProvider: "text",
        llmProvider: "text",
        languages: [],
      });
      anchor = await ctx.db.get(anchorId);
    }

    if (!anchor) {
      return { booked: false, confirmationId: "", slot: args.slot, message: "Could not create a chat session." };
    }

    // Validate the slot against the business hours directly — do NOT delegate to
    // internal.tools.bookAppointment, which selects `liveCall ?? mostRecent` for
    // the business and would mis-attach this booking to a concurrent voice call.
    const now = Date.now();
    const v2 = validateSlot(business.profile.hours, args.slot, now);
    if (!v2.ok) {
      return { booked: false, confirmationId: "", slot: args.slot, message: v2.message };
    }

    // Idempotency: a retried booking with the same session+slot is a no-op.
    // Keyed on the PARSED date+time (not the raw slot text) so the same slot
    // re-sent in a different format ("...T10:00" vs "... 10:00") is still
    // recognized as the caller's own booking rather than "already taken".
    const idempotencyKey = `${args.sessionId}:${v2.date} ${v2.time}`;
    const existingLeads = await ctx.db
      .query("leads")
      .withIndex("by_call", (q) => q.eq("callId", anchor._id))
      .collect();
    const prior = existingLeads.find(
      (l) => typeof l.request === "string" && l.request.includes(`idem:${idempotencyKey}`),
    );
    if (prior) {
      return { booked: true, confirmationId: prior._id, slot: args.slot, icsUrl: `/api/ics/${prior._id}`, message: "Appointment already booked (idempotent retry)." };
    }

    // Off-grid guard: see convex/tools.ts for why isWithinHours alone isn't
    // enough — the time must also land on the 30-min grid the calendar renders.
    if (!dayGrid(parseHours(business.profile.hours), v2.date).includes(v2.time)) {
      return {
        booked: false,
        confirmationId: "",
        slot: args.slot,
        message: await takenMessage(ctx, business, v2.date, v2.time, now, "off-grid"),
      };
    }

    if (await isSlotTaken(ctx, args.businessId, v2.date, v2.time)) {
      return {
        booked: false,
        confirmationId: "",
        slot: args.slot,
        message: await takenMessage(ctx, business, v2.date, v2.time, now),
      };
    }

    const requestSummary = [
      `Booking ${args.service ?? "appointment"} for ${args.customerName} at ${args.slot}`,
      args.notes ? `Notes: ${args.notes}` : null,
      `idem:${idempotencyKey}`,
    ].filter(Boolean).join(" | ");

    const leadId = await ctx.db.insert("leads", {
      callId: anchor._id,
      businessId: args.businessId,
      contact: args.contact,
      request: requestSummary,
      createdAt: now,
    });

    await insertBookedAppointment(ctx, {
      businessId: args.businessId,
      date: v2.date,
      time: v2.time,
      leadId,
      service: args.service,
      customerName: args.customerName,
    });

    await ctx.db.patch(anchor._id, {
      structuredData: {
        ...(typeof anchor.structuredData === "object" && anchor.structuredData !== null
          ? (anchor.structuredData as Record<string, unknown>)
          : {}),
        booking: {
          confirmationId: leadId,
          slot: args.slot,
          customerName: args.customerName,
          contact: args.contact,
          service: args.service ?? null,
          notes: args.notes ?? null,
          bookedAt: now,
          ...(v2.degradeNote ? { note: v2.degradeNote } : {}),
        },
      },
      outcome: "booked",
    });

    const baseMessage = `Booked ${args.service ?? "appointment"} for ${args.customerName} at ${args.slot}.`;
    return {
      booked: true,
      confirmationId: leadId,
      slot: args.slot,
      icsUrl: `/api/ics/${leadId}`,
      message: v2.degradeNote ? `${baseMessage} ${v2.degradeNote}` : baseMessage,
    };
  },
});
