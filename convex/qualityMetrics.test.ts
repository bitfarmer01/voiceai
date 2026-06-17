import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function makeCall(t: ReturnType<typeof convexTest>): Promise<Id<"calls">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("calls", {
      sessionId: "sess-1",
      businessId: "1businesses" as Id<"businesses">,
      businessName: "Test Co",
      status: "ended",
      startedAt: 1000,
      durationSec: 30,
      costUsd: 0.1,
      costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0.1 },
      sttProvider: "deepgram",
      ttsProvider: "11labs",
      llmProvider: "openai",
      languages: ["en"],
    });
  });
}

test("recordQualityMetrics patches the four deterministic metrics (sentiment omitted)", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  await t.mutation(api.calls.recordQualityMetrics, {
    callId,
    sessionId: "sess-1",
    metrics: { talkRatio: 0.6, interruptions: 1, deadAirSec: 2.5, wpm: 180 },
  });

  const call = await t.query(api.calls.getById, { callId });
  expect(call.qualityMetrics).toEqual({
    talkRatio: 0.6,
    interruptions: 1,
    deadAirSec: 2.5,
    wpm: 180,
  });
  expect(call.qualityMetrics.sentiment).toBeUndefined();
});

test("recordQualityMetrics clamps out-of-range values", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  await t.mutation(api.calls.recordQualityMetrics, {
    callId,
    sessionId: "sess-1",
    metrics: { talkRatio: 5, interruptions: -3, deadAirSec: -1, wpm: -10 },
  });

  const call = await t.query(api.calls.getById, { callId });
  expect(call.qualityMetrics).toEqual({
    talkRatio: 1, // clamped to [0,1]
    interruptions: 0, // clamped to >= 0
    deadAirSec: 0,
    wpm: 0,
  });
});

test("recordQualityMetrics rejects a caller whose sessionId does not own the call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t); // sessionId "sess-1"

  await t.mutation(api.calls.recordQualityMetrics, {
    callId,
    sessionId: "attacker-session",
    metrics: { talkRatio: 0.5, interruptions: 0, deadAirSec: 0, wpm: 100 },
  });

  const call = await t.query(api.calls.getById, { callId });
  expect(call.qualityMetrics).toBeUndefined(); // nothing written
});

test("recordQualityMetrics drops silently for an unknown call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);
  await t.run(async (ctx) => ctx.db.delete(callId));

  await t.mutation(api.calls.recordQualityMetrics, {
    callId,
    sessionId: "sess-1",
    metrics: { talkRatio: 1, interruptions: 0, deadAirSec: 0, wpm: 100 },
  });

  const call = await t.query(api.calls.getById, { callId });
  expect(call).toBeNull();
});
