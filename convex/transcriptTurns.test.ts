import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Insert a minimal live call row directly and return its id. */
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

test("recordTurns inserts finalized turns for a call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "sess-1",
    turns: [
      { idx: 0, role: "user", text: "hi", ts: 1100 },
      { idx: 1, role: "assistant", text: "hello, how can I help?", ts: 1400 },
    ],
  });

  const turns = await t.query(api.transcriptTurns.listByCall, { callId });
  expect(turns).toHaveLength(2);
  expect(turns[0].role).toBe("user");
  expect(turns[1].text).toBe("hello, how can I help?");
  expect(turns[0].interim).toBe(false);
});

test("recordTurns upserts by idx — re-flush does not duplicate and corrects text", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  // first flush (interim-ish text)
  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "sess-1",
    turns: [{ idx: 0, role: "user", text: "what are your", ts: 1100 }],
  });
  // second flush re-sends idx 0 (corrected) plus a new idx 1
  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "sess-1",
    turns: [
      { idx: 0, role: "user", text: "what are your hours", ts: 1100 },
      { idx: 1, role: "assistant", text: "nine to five", ts: 1600 },
    ],
  });

  const turns = await t.query(api.transcriptTurns.listByCall, { callId });
  expect(turns).toHaveLength(2); // no duplicate idx 0
  expect(turns[0].text).toBe("what are your hours"); // corrected
});

test("recordTurns drops silently for an unknown call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);
  // delete the call, then try to record
  await t.run(async (ctx) => ctx.db.delete(callId));

  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "sess-1",
    turns: [{ idx: 0, role: "user", text: "hi", ts: 1 }],
  });

  const turns = await t.query(api.transcriptTurns.listByCall, { callId });
  expect(turns).toHaveLength(0);
});

test("recordTurns skips patch when re-flush sends identical turns (idempotent no-op)", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  const turns = [
    { idx: 0, role: "user" as const, text: "hi there", ts: 1100 },
    { idx: 1, role: "assistant" as const, text: "hello!", ts: 1400 },
  ];

  // First flush — inserts both rows.
  await t.mutation(api.transcriptTurns.recordTurns, { callId, sessionId: "sess-1", turns });

  // Second flush with identical content — should be a no-op.
  await t.mutation(api.transcriptTurns.recordTurns, { callId, sessionId: "sess-1", turns });

  const stored = await t.query(api.transcriptTurns.listByCall, { callId });
  // Data is preserved correctly — still exactly 2 turns, same content.
  expect(stored).toHaveLength(2);
  expect(stored[0].text).toBe("hi there");
  expect(stored[1].text).toBe("hello!");
  expect(stored[0].interim).toBe(false);
});

test("recordTurns still patches when a field changes on re-flush", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t);

  // First flush — interim / incomplete text.
  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "sess-1",
    turns: [{ idx: 0, role: "user" as const, text: "what are your", ts: 1100 }],
  });

  // Second flush — text corrected (turn is now finalized).
  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "sess-1",
    turns: [{ idx: 0, role: "user" as const, text: "what are your hours", ts: 1100 }],
  });

  const stored = await t.query(api.transcriptTurns.listByCall, { callId });
  expect(stored).toHaveLength(1);
  expect(stored[0].text).toBe("what are your hours");
});

test("recordTurns rejects a caller whose sessionId does not own the call", async () => {
  const t = convexTest(schema, modules);
  const callId = await makeCall(t); // sessionId "sess-1"

  await t.mutation(api.transcriptTurns.recordTurns, {
    callId,
    sessionId: "attacker-session",
    turns: [{ idx: 0, role: "user", text: "spoof", ts: 1 }],
  });

  const turns = await t.query(api.transcriptTurns.listByCall, { callId });
  expect(turns).toHaveLength(0); // nothing written
});
