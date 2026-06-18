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
 *   - interruptions — user barge-ins: a user transcript arriving while the
 *                     assistant is mid-utterance. Computed from RAW event
 *                     arrival timestamps (see below), NOT from the derived
 *                     stt/tts spans — those are built non-overlapping and a
 *                     barge-in opens a fresh turn, so a span-based check is
 *                     structurally always 0.
 *   - deadAirSec  — wall-clock seconds inside the conversation with no one
 *                   speaking (window minus the union of stt+llm+tts intervals;
 *                   llm is included so model latency isn't miscounted as
 *                   silence).
 *   - wpm         — assistant words per minute over total TTS time.
 *
 * PURE: no Date.now()/Math.random(), no IO.
 */
import type { SpanKind, TurnRole } from "@/lib/types";
import type { VapiEvent } from "@/lib/vapi/derive-spans";

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

/**
 * Count barge-ins from RAW VAPI events by arrival timestamp.
 *
 * A barge-in is a user transcript event that lands WHILE the assistant is still
 * speaking — i.e. there is an assistant transcript event both before AND after
 * it (the assistant was mid-utterance: it had already started, and it kept
 * speaking past the user's interjection). The derived stt/tts spans can't reveal
 * this: they're built non-overlapping and a barge-in opens a fresh turn, so we
 * have to read it off the pre-turn-split raw stream.
 *
 * Consecutive user events with no assistant event between them count as a single
 * interruption (one continuous interjection), so multiple user partials inside
 * one assistant utterance aren't over-counted.
 *
 * NOTE(vapi-shape): this is ARRIVAL-timestamp-based and therefore approximate —
 * it depends on VAPI's transcript event ordering/latency, the same caveat as the
 * existing TODO(vapi-shape) in the span derivation. A live /try smoke test is
 * needed to confirm the SDK actually interleaves user events into an ongoing
 * assistant utterance (vs. buffering them until the assistant stops).
 */
function interruptionsFromEvents(events: VapiEvent[]): number {
  const tx = events.filter((e) => e.type === "transcript");
  if (tx.length === 0) return 0;

  let interruptions = 0;
  let sawAssistantBefore = false;
  let inUserRun = false; // are we inside a contiguous run of user events?
  for (let i = 0; i < tx.length; i++) {
    const ev = tx[i];
    if (ev.role === "assistant") {
      // An assistant event after a user run means the assistant resumed
      // speaking past the user's interjection → that run was a barge-in.
      if (inUserRun && sawAssistantBefore) interruptions++;
      inUserRun = false;
      sawAssistantBefore = true;
    } else if (ev.role === "user") {
      inUserRun = true;
    }
  }
  return interruptions;
}

export function computeQualityMetrics(
  turns: MetricTurn[],
  spans: MetricSpan[],
  events: VapiEvent[] = [],
): QualityMetrics {
  if (turns.length === 0 && spans.length === 0) return ZERO;

  const stt = spans.filter((s) => s.kind === "stt");
  const llm = spans.filter((s) => s.kind === "llm");
  const tts = spans.filter((s) => s.kind === "tts");

  const sumDur = (xs: MetricSpan[]) =>
    xs.reduce((acc, s) => acc + Math.max(0, s.endMs - s.startMs), 0);
  const userTalk = sumDur(stt);
  const asstTalk = sumDur(tts);

  // talkRatio — assistant share of speaking time.
  const totalTalk = userTalk + asstTalk;
  const talkRatio = totalTalk > 0 ? asstTalk / totalTalk : 0;

  // interruptions — barge-ins, computed from raw event arrival timestamps
  // (see interruptionsFromEvents). The derived stt/tts spans are non-overlapping
  // by construction, so a span-based check is structurally always 0.
  const interruptions = interruptionsFromEvents(events);

  // deadAir — conversation window minus the union of all speaking intervals.
  // Include llm spans so user-final→assistant-first-token model latency isn't
  // miscounted as silence.
  const speaking: Array<[number, number]> = [...stt, ...llm, ...tts].map((s) => [
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
