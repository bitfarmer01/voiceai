/**
 * Phase 3 — client-side span derivation.
 *
 * VAPI's Web SDK gives us coarse client messages (transcript with role +
 * partial/final, tool-calls, tool results) but NO per-component timing. This
 * pure function reduces an ordered buffer of those events into an OTel-shaped
 * `TraceSpan[]` that the post-call report waterfall renders.
 *
 * Turn boundaries come from transcript `role` + `final` — the only reliable
 * per-role signal (the SDK's speech-start/end events carry no role). The
 * stt/llm/tts micro-spans are therefore *approximations* of where transcription,
 * thinking, and speaking happened within a turn; each is tagged `attrs.approx`
 * so the UI never implies false precision (e.g. under barge-in).
 *
 * Timestamps are emitted RELATIVE to call-start (ms), so client spans (browser
 * clock) and server tool spans (Convex clock) share one axis without skew.
 *
 * PURE: no Date.now()/Math.random(), no IO. Deterministic span ids for testing.
 */
import type { TraceSpan } from "@/lib/types";

export type VapiEventType = "transcript" | "tool-call" | "tool-result";

/** A normalized VAPI client event the hook buffers, with a browser timestamp. */
export interface VapiEvent {
  /** Browser epoch ms when the event was observed. */
  ts: number;
  type: VapiEventType;
  /** transcript: who spoke. */
  role?: "user" | "assistant";
  /** transcript: transcriptType === "final". */
  final?: boolean;
  /** transcript text, for debugging/attrs. */
  text?: string;
  /** tool-call / tool-result: the tool name. */
  toolName?: string;
  /** tool-call / tool-result: correlates a call to its result. */
  toolCallId?: string;
}

interface Turn {
  user: VapiEvent[];
  assistant: VapiEvent[];
  tools: VapiEvent[];
}

function newTurn(): Turn {
  return { user: [], assistant: [], tools: [] };
}

/** Group an ordered event stream into conversational turns. */
function groupTurns(events: VapiEvent[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  let phase: "user" | "assistant" | null = null;

  for (const ev of events) {
    if (ev.type === "transcript") {
      if (ev.role === "user") {
        // A user speaking *after* an assistant reply opens a new turn.
        if (cur && phase === "assistant") {
          turns.push(cur);
          cur = null;
        }
        if (!cur) cur = newTurn();
        cur.user.push(ev);
        phase = "user";
      } else if (ev.role === "assistant") {
        if (!cur) cur = newTurn(); // assistant-first (greeting)
        cur.assistant.push(ev);
        phase = "assistant";
      }
    } else {
      // tool-call / tool-result attach to the in-flight turn.
      if (!cur) cur = newTurn();
      cur.tools.push(ev);
    }
  }
  if (cur) turns.push(cur);
  return turns;
}

const minTs = (evs: VapiEvent[]) => Math.min(...evs.map((e) => e.ts));
const maxTs = (evs: VapiEvent[]) => Math.max(...evs.map((e) => e.ts));
/** Last final's ts, else last event's ts. */
function endTs(evs: VapiEvent[]): number {
  const finals = evs.filter((e) => e.final);
  return finals.length ? maxTs(finals) : maxTs(evs);
}

/** Words across an event window's text (for estimating speech duration). */
function totalWords(evs: VapiEvent[]): number {
  // Prefer the longest final text per window (partials are prefixes of the
  // final); fall back to the longest text seen if there's no final.
  const finals = evs.filter((e) => e.final && e.text);
  const pool = (finals.length ? finals : evs).map((e) => e.text ?? "");
  const longest = pool.reduce((a, b) => (b.length > a.length ? b : a), "");
  return longest.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Estimate a speaking window's duration (ms) from a word count, assuming a
 * typical TTS speaking rate. Used to give single-`final` transcript turns a
 * non-zero-width tts span (VAPI sometimes emits exactly one `final` per turn,
 * collapsing minTs===maxTs → 0-width → wpm=0 / skewed talkRatio).
 */
const ASSUMED_WPM = 150;
const MIN_SPEECH_MS = 400; // floor so a 1-word reply still has a sane window
function estimateSpeechMs(words: number): number {
  return Math.max(MIN_SPEECH_MS, Math.round((words / ASSUMED_WPM) * 60000));
}

/**
 * Reduce buffered VAPI events into trace spans, relative to call-start.
 */
export function deriveSpansFromEvents(
  events: VapiEvent[],
  opts: { traceId: string; callStartMs: number },
): TraceSpan[] {
  const { traceId, callStartMs } = opts;
  if (events.length === 0) return [];

  const out: TraceSpan[] = [];
  const turns = groupTurns(events);

  turns.forEach((turn, i) => {
    const n = i + 1;
    const turnSpanId = `turn_${n}`;
    const children: TraceSpan[] = [];

    // Relative-ms clamp helper: never negative, never end < start.
    const rel = (t: number) => Math.max(0, t - callStartMs);
    const span = (
      kind: TraceSpan["kind"],
      spanId: string,
      label: string,
      startAbs: number,
      endAbs: number,
      approx: boolean,
      extra?: Record<string, string | number | boolean>,
    ): TraceSpan => {
      const startMs = rel(startAbs);
      const endMs = Math.max(startMs, rel(endAbs));
      return {
        traceId,
        spanId,
        parentId: turnSpanId,
        kind,
        label,
        startMs,
        endMs,
        durationMs: endMs - startMs,
        attrs: approx ? { approx: true, ...extra } : extra,
      };
    };

    const hasUser = turn.user.length > 0;
    const hasAsst = turn.assistant.length > 0;

    const userStart = hasUser ? minTs(turn.user) : undefined;
    const userEnd = hasUser ? endTs(turn.user) : undefined;
    const asstStart = hasAsst ? minTs(turn.assistant) : undefined;
    // When VAPI emits a single `final` per assistant turn, minTs===maxTs →
    // 0-width tts window (wpm=0, skewed talkRatio). Estimate the speaking
    // duration from the assistant word count at an assumed rate so the span
    // has a sane non-zero width.
    let asstEnd = hasAsst ? endTs(turn.assistant) : undefined;
    if (hasAsst && asstStart === asstEnd) {
      asstEnd = asstStart! + estimateSpeechMs(totalWords(turn.assistant));
    }

    // stt — user transcription window
    if (hasUser) {
      children.push(span("stt", `stt_${n}`, "Transcribe (STT)", userStart!, userEnd!, true));
    }
    // llm — gap from user-final to assistant's first token
    if (hasUser && hasAsst) {
      children.push(span("llm", `llm_${n}`, "Reason (LLM)", userEnd!, asstStart!, true));
    }
    // tts — assistant speaking window
    if (hasAsst) {
      children.push(span("tts", `tts_${n}`, "Speak (TTS)", asstStart!, asstEnd!, true));
    }

    // tool spans — match call↔result by toolCallId; unmatched = zero-width.
    // Each result is consumed at most once, so two calls sharing an id don't
    // both resolve to the same result (the second falls back to zero-width).
    const calls = turn.tools.filter((e) => e.type === "tool-call");
    const results = turn.tools.filter((e) => e.type === "tool-result");
    const usedResults = new Set<number>();
    calls.forEach((call, j) => {
      let result: VapiEvent | undefined;
      for (let k = 0; k < results.length; k++) {
        if (!usedResults.has(k) && results[k].toolCallId === call.toolCallId) {
          usedResults.add(k);
          result = results[k];
          break;
        }
      }
      const label = `Tool · ${call.toolName ?? "unknown"}`;
      children.push(
        span("tool", `tool_${n}_${j + 1}`, label, call.ts, result?.ts ?? call.ts, false, {
          tool: call.toolName ?? "unknown",
        }),
      );
    });

    if (children.length === 0) return;

    // Parent turn wraps all children.
    const starts = children.map((c) => c.startMs);
    const ends = children.map((c) => c.endMs);
    const turnStart = Math.min(...starts);
    const turnEnd = Math.max(...ends);
    out.push({
      traceId,
      spanId: turnSpanId,
      kind: "turn",
      label: `Turn ${n}`,
      startMs: turnStart,
      endMs: turnEnd,
      durationMs: turnEnd - turnStart,
    });
    out.push(...children);
  });

  return out;
}
