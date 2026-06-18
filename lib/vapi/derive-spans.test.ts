import { describe, expect, test } from "vitest";
import { deriveSpansFromEvents, type VapiEvent } from "./derive-spans";

const TRACE = "call_abc";

/** Convenience: a transcript event. */
function tx(
  ts: number,
  role: "user" | "assistant",
  final: boolean,
  text = "x",
): VapiEvent {
  return { ts, type: "transcript", role, final, text };
}

describe("deriveSpansFromEvents", () => {
  test("empty events → no spans", () => {
    expect(deriveSpansFromEvents([], { traceId: TRACE, callStartMs: 0 })).toEqual([]);
  });

  test("a single user→assistant turn yields turn + stt + llm + tts", () => {
    const callStartMs = 1000;
    const events: VapiEvent[] = [
      tx(1100, "user", false, "what are"), // user starts speaking (partial)
      tx(1400, "user", true, "what are your hours"), // user final → STT done
      tx(1900, "assistant", false, "we are"), // assistant first token → LLM done, TTS starts
      tx(2600, "assistant", true, "we are open nine to five"), // assistant final → TTS done
    ];

    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs });

    const turn = spans.find((s) => s.kind === "turn")!;
    const stt = spans.find((s) => s.kind === "stt")!;
    const llm = spans.find((s) => s.kind === "llm")!;
    const tts = spans.find((s) => s.kind === "tts")!;

    expect(turn).toBeTruthy();
    // all spans carry the trace id
    for (const s of spans) expect(s.traceId).toBe(TRACE);

    // relative-to-call-start timestamps (callStartMs subtracted)
    expect(stt.startMs).toBe(100); // 1100 - 1000
    expect(stt.endMs).toBe(400); // 1400 - 1000
    expect(stt.durationMs).toBe(300);

    expect(llm.startMs).toBe(400); // user final
    expect(llm.endMs).toBe(900); // assistant first token
    expect(llm.durationMs).toBe(500);

    expect(tts.startMs).toBe(900);
    expect(tts.endMs).toBe(1600); // 2600 - 1000
    expect(tts.durationMs).toBe(700);

    // turn wraps the whole exchange
    expect(turn.startMs).toBe(100);
    expect(turn.endMs).toBe(1600);

    // micro-spans are flagged as approximations; children point at the turn
    for (const s of [stt, llm, tts]) {
      expect(s.attrs?.approx).toBe(true);
      expect(s.parentId).toBe(turn.spanId);
    }
  });

  test("assistant-first greeting produces a tts-only turn (no stt/llm)", () => {
    const events: VapiEvent[] = [
      tx(100, "assistant", false, "hi"),
      tx(800, "assistant", true, "hi, how can I help?"),
      tx(2000, "user", false, "book"),
      tx(2300, "user", true, "book an appointment"),
      tx(2800, "assistant", false, "sure"),
      tx(3400, "assistant", true, "sure, when?"),
    ];

    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const turns = spans.filter((s) => s.kind === "turn");
    expect(turns).toHaveLength(2);

    // first turn: greeting → tts only, no stt/llm under it
    const greetTurn = turns[0];
    const greetChildren = spans.filter((s) => s.parentId === greetTurn.spanId);
    expect(greetChildren.map((s) => s.kind).sort()).toEqual(["tts"]);

    // second turn: full user→assistant cycle
    const second = turns[1];
    const secondKinds = spans
      .filter((s) => s.parentId === second.spanId)
      .map((s) => s.kind)
      .sort();
    expect(secondKinds).toEqual(["llm", "stt", "tts"]);
  });

  test("a tool call inside a turn becomes a tool span parented to that turn", () => {
    const events: VapiEvent[] = [
      tx(100, "user", true, "are you open saturday"),
      { ts: 250, type: "tool-call", toolName: "check_availability", toolCallId: "t1" },
      { ts: 520, type: "tool-result", toolName: "check_availability", toolCallId: "t1" },
      tx(700, "assistant", false, "yes"),
      tx(1200, "assistant", true, "yes, nine to one"),
    ];

    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const tool = spans.find((s) => s.kind === "tool")!;
    const turn = spans.find((s) => s.kind === "turn")!;

    expect(tool).toBeTruthy();
    expect(tool.label).toContain("check_availability");
    expect(tool.startMs).toBe(250);
    expect(tool.endMs).toBe(520);
    expect(tool.durationMs).toBe(270);
    expect(tool.parentId).toBe(turn.spanId);
  });

  test("an unmatched tool-call (no result) still emits a zero-width tool span", () => {
    const events: VapiEvent[] = [
      tx(100, "user", true, "book it"),
      { ts: 300, type: "tool-call", toolName: "book_appointment", toolCallId: "t9" },
      tx(900, "assistant", true, "booked"),
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const tool = spans.find((s) => s.kind === "tool")!;
    expect(tool).toBeTruthy();
    expect(tool.startMs).toBe(300);
    expect(tool.endMs).toBeGreaterThanOrEqual(300);
    expect(tool.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("two tool-calls sharing a toolCallId: only the first claims the result", () => {
    const events: VapiEvent[] = [
      tx(100, "user", true, "check both"),
      { ts: 200, type: "tool-call", toolName: "check_availability", toolCallId: "dup" },
      { ts: 250, type: "tool-call", toolName: "check_availability", toolCallId: "dup" },
      { ts: 600, type: "tool-result", toolName: "check_availability", toolCallId: "dup" },
      tx(900, "assistant", true, "ok"),
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const tools = spans.filter((s) => s.kind === "tool");
    expect(tools).toHaveLength(2);
    // first call claims the result (200→600); second falls back to zero-width (250→250)
    const matched = tools.find((t) => t.startMs === 200)!;
    const unmatched = tools.find((t) => t.startMs === 250)!;
    expect(matched.endMs).toBe(600);
    expect(unmatched.endMs).toBe(250);
    expect(unmatched.durationMs).toBe(0);
  });

  test("barge-in (assistant token before user final) never yields a negative duration", () => {
    // overlapping speech: assistant starts before the user 'final' lands
    const events: VapiEvent[] = [
      tx(100, "user", false, "wait"),
      tx(600, "assistant", false, "sorry"), // assistant starts mid-user
      tx(700, "user", true, "wait stop"), // user final lands later
      tx(1300, "assistant", true, "of course"),
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    for (const s of spans) {
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
      expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
    }
  });

  test("multiple user partials → stt span spans first partial to final", () => {
    const events: VapiEvent[] = [
      tx(200, "user", false, "what"),
      tx(350, "user", false, "what time"),
      tx(500, "user", true, "what time do you close"),
      tx(900, "assistant", true, "five"),
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const stt = spans.find((s) => s.kind === "stt")!;
    expect(stt.startMs).toBe(200);
    expect(stt.endMs).toBe(500);
  });

  test("single-final assistant transcript → tts span has a non-zero width (estimated)", () => {
    // VAPI emits exactly one `final` for the assistant turn at ts=900, so
    // minTs === maxTs and the raw window would be 0-width. We estimate the
    // speaking duration from the assistant word count instead.
    const events: VapiEvent[] = [
      tx(200, "user", true, "what time do you close"),
      tx(900, "assistant", true, "we are open from nine to five every day"), // 9 words, single final
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const tts = spans.find((s) => s.kind === "tts")!;
    expect(tts).toBeTruthy();
    // 9 words / 150 wpm * 60000ms = 3600ms; well above the floor.
    expect(tts.startMs).toBe(900);
    expect(tts.durationMs).toBeGreaterThan(0);
    expect(tts.durationMs).toBe(3600);
    expect(tts.endMs).toBe(900 + 3600);
  });

  test("single-final one-word assistant reply → tts width respects the minimum floor", () => {
    const events: VapiEvent[] = [
      tx(200, "user", true, "are you open"),
      tx(800, "assistant", true, "yes"), // 1 word → estimate below floor
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const tts = spans.find((s) => s.kind === "tts")!;
    // 1 word / 150 wpm ≈ 400ms estimate, clamped to the 400ms floor either way;
    // the key assertion is that it is NOT zero-width.
    expect(tts.durationMs).toBeGreaterThanOrEqual(400);
  });

  test("multi-final assistant turn keeps the real (non-estimated) tts window", () => {
    // Two assistant finals → minTs !== maxTs, so the real timestamps are used
    // and we do NOT substitute an estimate.
    const events: VapiEvent[] = [
      tx(100, "user", true, "hi"),
      tx(600, "assistant", true, "hello there"),
      tx(1400, "assistant", true, "how can I help"),
    ];
    const spans = deriveSpansFromEvents(events, { traceId: TRACE, callStartMs: 0 });
    const tts = spans.find((s) => s.kind === "tts")!;
    expect(tts.startMs).toBe(600);
    expect(tts.endMs).toBe(1400); // real last-final ts, not an estimate
    expect(tts.durationMs).toBe(800);
  });
});
