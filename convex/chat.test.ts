// convex/chat.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedConfigured(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("businesses", {
      sessionId: "seed",
      name: "Glow Dental",
      kind: "configured",
      chunkCount: 0,
      createdAt: Date.now(),
      profile: {
        companyName: "Glow Dental",
        hours: "Mon-Fri 9am-5pm",
        services: ["cleaning"],
        policies: [],
        availability: "",
      },
    } as any),
  );
}

test("bookAppointment creates a single chat anchor and books against it", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);

  const res = await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-abc",
    // 2099-06-16 is a Monday; 10:00 is within Mon-Fri 9am-5pm
    slot: "2099-06-16T10:00",
    customerName: "Pat",
    contact: "pat@example.com",
    service: "cleaning",
  });

  expect(res.booked).toBe(true);
  expect(res.confirmationId).not.toBe("");

  // Exactly one anchor row, marked channel:"chat".
  const calls = await t.run(async (ctx) =>
    ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", "chat-abc")).collect(),
  );
  expect(calls.length).toBe(1);
  expect(calls[0].channel).toBe("chat");

  // A second booking on the same session reuses the same anchor (no duplicate).
  await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-abc",
    // 2099-06-17 is a Tuesday — also within hours
    slot: "2099-06-17T11:00",
    customerName: "Pat",
    contact: "pat@example.com",
  });
  const calls2 = await t.run(async (ctx) =>
    ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", "chat-abc")).collect(),
  );
  expect(calls2.length).toBe(1);
});

test("bookAppointment anchors to the chat call, NOT a concurrent live voice call", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);

  // Seed a live voice call for the same business (simulates a concurrent voice session).
  const voiceCallId = await t.run(async (ctx) =>
    ctx.db.insert("calls", {
      sessionId: "voice-session-xyz",
      businessId: businessId as any,
      businessName: "Glow Dental",
      status: "live",
      channel: "voice",
      startedAt: Date.now() - 5000, // started 5 seconds ago
      durationSec: 5,
      costUsd: 0,
      costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
      sttProvider: "deepgram",
      ttsProvider: "vapi",
      llmProvider: "gpt-4o-mini",
      languages: ["en"],
    } as any),
  );

  // Now book via chat (different sessionId, channel:"chat").
  const res = await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-session-abc",
    // 2099-06-16 is a Monday, 10:00 within Mon-Fri 9am-5pm
    slot: "2099-06-16T10:00",
    customerName: "Alex",
    contact: "alex@example.com",
    service: "cleaning",
  });

  expect(res.booked).toBe(true);

  // Find the chat anchor that was created.
  const chatAnchor = await t.run(async (ctx) =>
    ctx.db
      .query("calls")
      .withIndex("by_session", (q) => q.eq("sessionId", "chat-session-abc"))
      .filter((q) => q.eq(q.field("channel"), "chat"))
      .first(),
  );
  expect(chatAnchor).not.toBeNull();

  // The lead must be attached to the CHAT anchor, not the voice call.
  const lead = await t.run(async (ctx) =>
    ctx.db
      .query("leads")
      .withIndex("by_call", (q) => q.eq("callId", chatAnchor!._id))
      .first(),
  );
  expect(lead).not.toBeNull();
  expect(lead!.callId).toEqual(chatAnchor!._id);
  // Explicitly confirm: the lead is NOT attached to the voice call.
  expect(lead!.callId).not.toEqual(voiceCallId);

  // The voice call row must have NO structuredData.booking.
  const voiceCall = await t.run(async (ctx) => ctx.db.get(voiceCallId as any));
  const voiceStructured = voiceCall?.structuredData as Record<string, unknown> | undefined;
  expect(voiceStructured?.booking).toBeUndefined();
});

test("bookAppointment rejects a past slot", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);

  const res = await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-past",
    slot: "2020-01-01T10:00",
    customerName: "Pat",
    contact: "pat@example.com",
  });

  expect(res.booked).toBe(false);
  expect(res.message).toMatch(/past/i);
});

test("bookAppointment rejects a closed-day slot", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);

  // 2099-06-21 is a Saturday — closed under Mon-Fri 9am-5pm
  const res = await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-closed",
    slot: "2099-06-21T10:00",
    customerName: "Pat",
    contact: "pat@example.com",
  });

  expect(res.booked).toBe(false);
  expect(res.message).toMatch(/closed|Saturday|Mon-Fri/i);
});

test("lookupKnowledge wrapper returns the contract shape", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);
  const out = await t.query(api.chat.lookupKnowledge, {
    businessId: businessId as any,
    query: "hours",
  });
  expect(out).toHaveProperty("found");
  expect(Array.isArray(out.chunks)).toBe(true);
});
