import { describe, expect, test } from "vitest";
import {
  computeQualityMetrics,
  type MetricSpan,
  type MetricTurn,
} from "./quality-metrics";
import type { VapiEvent } from "@/lib/vapi/derive-spans";

const span = (
  kind: MetricSpan["kind"],
  startMs: number,
  endMs: number,
): MetricSpan => ({ kind, startMs, endMs });

/** A raw transcript event (what the hook buffers before turn-splitting). */
const tx = (
  ts: number,
  role: "user" | "assistant",
  final = true,
): VapiEvent => ({ ts, type: "transcript", role, final, text: "x" });

describe("computeQualityMetrics", () => {
  test("no turns / no spans → all zeros", () => {
    expect(computeQualityMetrics([], [])).toEqual({
      talkRatio: 0,
      interruptions: 0,
      deadAirSec: 0,
      wpm: 0,
    });
  });

  test("balanced turn: talkRatio, wpm, and deadAir from the timeline", () => {
    const turns: MetricTurn[] = [
      { role: "user", text: "what time do you close" }, // 5 words
      { role: "assistant", text: "we are open from nine to five" }, // 7 words
    ];
    const spans: MetricSpan[] = [
      span("stt", 0, 1000), // user speaks 1s
      span("tts", 1500, 3500), // assistant speaks 2s
    ];

    const m = computeQualityMetrics(turns, spans);

    // assistant share of speaking time = 2000 / (1000 + 2000)
    expect(m.talkRatio).toBeCloseTo(0.667, 2);
    // 7 assistant words over 2s of TTS = 210 wpm
    expect(m.wpm).toBe(210);
    // total window 0..3500 = 3500ms; speaking union = 3000ms; dead air = 500ms
    expect(m.deadAirSec).toBeCloseTo(0.5, 3);
    expect(m.interruptions).toBe(0);
  });

  test("interruptions: a true barge-in (user transcript mid-assistant-utterance) counts", () => {
    // Realistic raw event stream: the assistant is mid-utterance (first token at
    // 0, last final at 2000) when the user starts talking at 1000. The real span
    // pipeline splits this into non-overlapping turns, so interruptions MUST be
    // derived from the raw arrival timestamps — which is what we feed here.
    const turns: MetricTurn[] = [
      { role: "assistant", text: "let me explain the whole policy in detail" },
      { role: "user", text: "stop" },
    ];
    const events: VapiEvent[] = [
      tx(0, "assistant", false), // assistant first token
      tx(500, "assistant", false),
      tx(1000, "user", true), // user barges in while assistant still speaking
      tx(2000, "assistant", true), // assistant's last final (after the barge-in)
    ];
    // Spans are the NON-overlapping windows the real pipeline emits — proof the
    // count does not come from the spans.
    const spans: MetricSpan[] = [
      span("tts", 0, 1000),
      span("stt", 1000, 1500),
    ];
    const m = computeQualityMetrics(turns, spans, events);
    expect(m.interruptions).toBe(1);
  });

  test("interruptions: a clean back-and-forth (no overlap) yields zero", () => {
    // User finishes, THEN the assistant speaks, THEN the user replies — no event
    // arrives while the assistant is mid-utterance.
    const events: VapiEvent[] = [
      tx(0, "user", true),
      tx(500, "assistant", false),
      tx(1500, "assistant", true), // assistant done at 1500
      tx(2500, "user", true), // user replies AFTER, not during
    ];
    const m = computeQualityMetrics([], [span("tts", 500, 1500)], events);
    expect(m.interruptions).toBe(0);
  });

  test("interruptions: with non-overlapping spans and no events passed, defaults to zero", () => {
    // The hook's spans are non-overlapping by construction; with no raw events
    // (back-compat default), interruptions cannot be inferred → 0.
    const spans: MetricSpan[] = [span("stt", 0, 1000), span("tts", 1000, 3000)];
    const m = computeQualityMetrics([], spans);
    expect(m.interruptions).toBe(0);
  });

  test("assistant-only greeting → talkRatio 1, no interruptions", () => {
    const turns: MetricTurn[] = [
      { role: "assistant", text: "hi how can I help you today" }, // 7 words
    ];
    const spans: MetricSpan[] = [span("tts", 0, 3000)];
    const m = computeQualityMetrics(turns, spans);
    expect(m.talkRatio).toBe(1);
    expect(m.interruptions).toBe(0);
    expect(m.wpm).toBe(140); // 7 words / 0.05 min
    expect(m.deadAirSec).toBe(0);
  });

  test("overlapping speaking windows are not double-counted in dead air", () => {
    const spans: MetricSpan[] = [
      span("tts", 0, 2000),
      span("stt", 1000, 3000), // overlaps tts, extends to 3000
    ];
    const m = computeQualityMetrics([], spans);
    // union of speaking = 0..3000 = 3000ms; window = 3000ms; dead air = 0
    expect(m.deadAirSec).toBe(0);
  });

  test("model latency (llm span) is NOT counted as dead air", () => {
    // stt 0..1000, then an llm 'thinking' gap 1000..2000, then tts 2000..3000.
    // The llm gap is normal model latency, not silence — including llm in the
    // speaking union means dead air should be 0, not 1s.
    const spans: MetricSpan[] = [
      span("stt", 0, 1000),
      span("llm", 1000, 2000),
      span("tts", 2000, 3000),
    ];
    const m = computeQualityMetrics([], spans);
    expect(m.deadAirSec).toBe(0);
  });

  test("a genuine silent gap (not model latency) still counts as dead air", () => {
    // stt 0..1000, then true silence 1000..1500 (no llm/tts), then tts 1500..2500.
    const spans: MetricSpan[] = [span("stt", 0, 1000), span("tts", 1500, 2500)];
    const m = computeQualityMetrics([], spans);
    expect(m.deadAirSec).toBeCloseTo(0.5, 3);
  });
});
