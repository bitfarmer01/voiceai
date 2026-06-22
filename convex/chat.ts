/**
 * Public chat-facing wrappers. The text-twin chatbot (app/api/chat/route.ts)
 * cannot call internalQuery/internalMutation directly, so these thin PUBLIC
 * functions delegate to the FROZEN internal tools (convex/tools.ts) verbatim.
 * No business logic lives here except the booking ANCHOR: a text chat has no
 * voice call, but `leads.callId` is a required FK, so bookAppointment
 * find-or-creates a minimal channel:"chat" `calls` row for {businessId, sessionId}
 * and lets the internal tool attach the booking to it. Chat messages themselves
 * are never persisted.
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
    const existing = await ctx.db
      .query("calls")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const anchor = existing.find((c) => c.channel === "chat") ?? null;
    if (!anchor) {
      const now = Date.now();
      await ctx.db.insert("calls", {
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
    }

    // Delegate to the frozen internal tool. It anchors the lead to the most
    // recent call for the business — the chat anchor we just ensured (newest
    // startedAt). idempotencyKey is per session+slot so a retry can't double-book.
    return ctx.runMutation(internal.tools.bookAppointment, {
      businessId: args.businessId,
      slot: args.slot,
      customerName: args.customerName,
      contact: args.contact,
      service: args.service,
      notes: args.notes,
      idempotencyKey: `${args.sessionId}:${args.slot}`,
    });
  },
});
