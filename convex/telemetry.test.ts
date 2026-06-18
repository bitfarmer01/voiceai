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
      status: "live",
      startedAt: 1000,
      durationSec: 0,
      costUsd: 0,
      costBreakdown: { stt: 0, llm: 0, tts: 0, platform: 0 },
      sttProvider: "deepgram",
      ttsProvider: "11labs",
      llmProvider: "openai",
      languages: ["en"],
    });
  });
}

const span = (callId: string, spanId: string, over: Partial<Record<string, unknown>> = {}) => ({
  traceId: callId,
  spanId,
  kind: "turn" as const,
  label: spanId,
  startMs: 0,
  endMs: 100,
  durationMs: 100,
  ...over,
});

test("batchWriteSpans writes spans keyed to the call and they read back by trace", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [span(callId, "turn_1"), span(callId, "stt_1", { kind: "stt", parentId: "turn_1" })],
  });

  const got = await t.query(api.spans.listByTrace, { traceId: callId });
  expect(got).toHaveLength(2);
  expect(got.map((s) => s.spanId).sort()).toEqual(["stt_1", "turn_1"]);
});

test("batchWriteSpans is idempotent — re-flush upserts, no duplicates, updates window", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [span(callId, "tts_1", { kind: "tts", endMs: 100, durationMs: 100 })],
  });
  // assistant kept speaking → same spanId, grown window
  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [span(callId, "tts_1", { kind: "tts", endMs: 500, durationMs: 500 })],
  });

  const got = await t.query(api.spans.listByTrace, { traceId: callId });
  expect(got).toHaveLength(1); // no duplicate
  expect(got[0].endMs).toBe(500); // window updated
  expect(got[0].durationMs).toBe(500);
});

test("batchWriteSpans insert-then-update across two flushes — single record, field updated", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  // First flush: three spans inserted fresh.
  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [
      span(callId, "turn_1", { startMs: 0, endMs: 200, durationMs: 200 }),
      span(callId, "stt_1", { kind: "stt", parentId: "turn_1", startMs: 10, endMs: 150, durationMs: 140 }),
      span(callId, "tts_1", { kind: "tts", parentId: "turn_1", startMs: 160, endMs: 200, durationMs: 40 }),
    ],
  });

  const afterFirst = await t.query(api.spans.listByTrace, { traceId: callId });
  expect(afterFirst).toHaveLength(3);

  // Second flush: re-sends all three, but turn_1 and tts_1 have grown windows.
  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [
      span(callId, "turn_1", { startMs: 0, endMs: 500, durationMs: 500 }),   // grew
      span(callId, "stt_1", { kind: "stt", parentId: "turn_1", startMs: 10, endMs: 150, durationMs: 140 }), // unchanged
      span(callId, "tts_1", { kind: "tts", parentId: "turn_1", startMs: 160, endMs: 480, durationMs: 320 }), // grew
    ],
  });

  const afterSecond = await t.query(api.spans.listByTrace, { traceId: callId });
  // Still exactly 3 rows — no duplicates from the second flush.
  expect(afterSecond).toHaveLength(3);

  const byId = new Map(afterSecond.map((s) => [s.spanId, s]));
  // turn_1 updated.
  expect(byId.get("turn_1")!.endMs).toBe(500);
  expect(byId.get("turn_1")!.durationMs).toBe(500);
  // stt_1 unchanged.
  expect(byId.get("stt_1")!.endMs).toBe(150);
  // tts_1 updated.
  expect(byId.get("tts_1")!.endMs).toBe(480);
  expect(byId.get("tts_1")!.durationMs).toBe(320);
});

test("batchWriteSpans rejects spans not keyed to the passed call (no cross-trace contamination)", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);
  const otherCallId = await makeCall(t);

  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [
      span(callId, "turn_1"), // valid
      span(otherCallId, "turn_evil"), // traceId points at another call → dropped
    ],
  });

  const mine = await t.query(api.spans.listByTrace, { traceId: callId });
  expect(mine.map((s) => s.spanId)).toEqual(["turn_1"]);
  const other = await t.query(api.spans.listByTrace, { traceId: otherCallId });
  expect(other).toHaveLength(0); // the spoofed span never landed
});

test("batchWriteSpans drops silently for an unknown call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);
  await t.run(async (ctx) => ctx.db.delete(callId));

  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "sess-1",
    spans: [span(callId, "turn_1")],
  });

  const got = await t.query(api.spans.listByTrace, { traceId: callId });
  expect(got).toHaveLength(0);
});

test("batchWriteSpans rejects a caller whose sessionId does not own the call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t); // sessionId "sess-1"

  await t.mutation(api.telemetry.batchWriteSpans, {
    callId,
    sessionId: "attacker-session",
    spans: [span(callId, "turn_1")],
  });

  const got = await t.query(api.spans.listByTrace, { traceId: callId });
  expect(got).toHaveLength(0); // nothing written
});
