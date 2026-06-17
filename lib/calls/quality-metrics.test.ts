import { describe, expect, test } from "vitest";
import {
  computeQualityMetrics,
  type MetricSpan,
  type MetricTurn,
} from "./quality-metrics";

const span = (
  kind: MetricSpan["kind"],
  startMs: number,
  endMs: number,
): MetricSpan => ({ kind, startMs, endMs });

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

  test("user speaking inside an assistant window counts as one interruption", () => {
    const turns: MetricTurn[] = [
      { role: "assistant", text: "let me explain the whole policy in detail" },
      { role: "user", text: "stop" },
    ];
    const spans: MetricSpan[] = [
      span("tts", 0, 2000), // assistant speaking 0..2000
      span("stt", 1000, 1500), // user barges in at 1000
    ];
    const m = computeQualityMetrics(turns, spans);
    expect(m.interruptions).toBe(1);
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
});
