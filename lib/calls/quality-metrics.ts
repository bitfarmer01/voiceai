/**
 * Phase 3 — deterministic call quality metrics.
 *
 * Computed client-side at call-end from the buffered transcript turns and the
 * derived trace spans (the server never sees per-turn transcripts — there is no
 * server-side turn store to recompute from). Sentiment is intentionally NOT
 * computed here: it needs a model call and is deferred to v1.1.
 *
 * Definitions:
 *   - talkRatio   — assistant share of total speaking time (0..1).
 *   - interruptions — user speaking windows (stt) that begin inside an
 *                     assistant speaking window (tts) — i.e. barge-ins.
 *   - deadAirSec  — wall-clock seconds inside the conversation with no one
 *                   speaking (window minus the union of stt+tts intervals).
 *   - wpm         — assistant words per minute over total TTS time.
 *
 * PURE: no Date.now()/Math.random(), no IO.
 */
import type { SpanKind, TurnRole } from "@/lib/types";

export interface MetricTurn {
  role: TurnRole;
  text: string;
}

export interface MetricSpan {
  kind: SpanKind;
  startMs: number;
  endMs: number;
}

export interface QualityMetrics {
  talkRatio: number;
  interruptions: number;
  deadAirSec: number;
  wpm: number;
}

const ZERO: QualityMetrics = {
  talkRatio: 0,
  interruptions: 0,
  deadAirSec: 0,
  wpm: 0,
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Total length of the union of [start,end] intervals, in ms. */
function unionMs(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s > curEnd) {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  total += curEnd - curStart;
  return total;
}

export function computeQualityMetrics(
  turns: MetricTurn[],
  spans: MetricSpan[],
): QualityMetrics {
  if (turns.length === 0 && spans.length === 0) return ZERO;

  const stt = spans.filter((s) => s.kind === "stt");
  const tts = spans.filter((s) => s.kind === "tts");

  const sumDur = (xs: MetricSpan[]) =>
    xs.reduce((acc, s) => acc + Math.max(0, s.endMs - s.startMs), 0);
  const userTalk = sumDur(stt);
  const asstTalk = sumDur(tts);

  // talkRatio — assistant share of speaking time.
  const totalTalk = userTalk + asstTalk;
  const talkRatio = totalTalk > 0 ? asstTalk / totalTalk : 0;

  // interruptions — a user window beginning inside an assistant window.
  let interruptions = 0;
  for (const u of stt) {
    if (tts.some((a) => u.startMs > a.startMs && u.startMs < a.endMs)) {
      interruptions++;
    }
  }

  // deadAir — conversation window minus the union of all speaking intervals.
  const speaking: Array<[number, number]> = [...stt, ...tts].map((s) => [
    s.startMs,
    s.endMs,
  ]);
  let deadAirSec = 0;
  if (speaking.length > 0) {
    const windowStart = Math.min(...speaking.map(([s]) => s));
    const windowEnd = Math.max(...speaking.map(([, e]) => e));
    const window = windowEnd - windowStart;
    deadAirSec = Math.max(0, window - unionMs(speaking)) / 1000;
  }

  // wpm — assistant words over total TTS minutes.
  const asstWords = turns
    .filter((t) => t.role === "assistant")
    .reduce((acc, t) => acc + wordCount(t.text), 0);
  const asstMinutes = asstTalk / 60000;
  const wpm = asstMinutes > 0 ? Math.round(asstWords / asstMinutes) : 0;

  return { talkRatio, interruptions, deadAirSec, wpm };
}
