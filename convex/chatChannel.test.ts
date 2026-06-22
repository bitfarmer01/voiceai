// convex/chatChannel.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const baseCall = (over: Record<string, unknown>) => ({
  sessionId: "s1",
  businessName: "Acme",
  status: "ended" as const,
  startedAt: 1000,
  durationSec: 10,
  costUsd: 0,
  costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
  sttProvider: "deepgram",
  ttsProvider: "vapi",
  llmProvider: "gpt-4o-mini",
  languages: ["en"],
  ...over,
});

test("listRecentAnonymized and ownerStats.summary exclude channel:'chat' anchors", async () => {
  const t = convexTest(schema, modules);
  const businessId = await t.run(async (ctx) =>
    ctx.db.insert("businesses", {
      sessionId: "seed",
      name: "Acme",
      kind: "configured",
      chunkCount: 0,
      createdAt: 1000,
      profile: {
        companyName: "Acme",
        hours: "Mon-Fri 9-5",
        services: [],
        policies: [],
        availability: "",
      },
    } as any),
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("calls", baseCall({ businessId, channel: "voice", outcome: "booked", startedAt: 2000, structuredData: { booking: { confirmationId: "v", slot: "2099-01-01T09:00", customerName: "V", contact: "v@v.co", bookedAt: 1 } } }) as any);
    await ctx.db.insert("calls", baseCall({ businessId, channel: "chat", startedAt: 3000, structuredData: { booking: { confirmationId: "x", slot: "2099-01-01T10:00", customerName: "Z", contact: "z@z.co", bookedAt: 1 } } }) as any);
  });

  const feed = await t.query(api.calls.listRecentAnonymized, { limit: 20 });
  expect(feed.length).toBe(1);
  expect(feed.every((c) => c.businessName === "Acme")).toBe(true);

  const summary = await t.query(api.ownerStats.summary, {});
  expect(summary.callsAnswered).toBe(1); // the voice call only; chat anchor excluded
  expect(summary.appointmentsBooked).toBe(1); // the voice booking, NOT the chat anchor's booking
});
