"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getVapi } from "./client";
import { notifyTimeCap } from "@/components/states/guard-panels";
import { deriveSpansFromEvents, type VapiEvent } from "./derive-spans";
import { computeQualityMetrics } from "@/lib/calls/quality-metrics";
import { callIsBusy, type CallStatus, type TranscriptTurn } from "@/lib/types";
import { prop } from "@/lib/unknown";
import { BUDGET } from "@/convex/_contracts";

/** Canonical per-call length cap — single source of truth in the budget contract.
 *  Annotated `number` (not the `as const` literal) so `useState`/`setSecondsLeft`
 *  infer a numeric counter rather than the literal type. */
const MAX_SECONDS: number = BUDGET.MAX_CALL_SECONDS;
/** How often we flush the buffered trace to Convex during a live call. */
const FLUSH_INTERVAL_MS = 5000;

export interface VapiCall {
  status: CallStatus;
  /** True while the call is connecting or live (status === "connecting" | "live"). */
  inProgress: boolean;
  turns: TranscriptTurn[];
  volume: number;
  agentSpeaking: boolean;
  muted: boolean;
  error: string | null;
  secondsLeft: number;
  /**
   * Pass the Convex call id (so the trace is keyed to it) and the session id
   * (so flush writes prove ownership of the call).
   */
  start: (assistant: unknown, callId: string, sessionId: string) => Promise<string | null>;
  stop: () => void;
  toggleMute: () => void;
  reset: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function applyTranscript(
  prev: TranscriptTurn[],
  role: "user" | "assistant",
  text: string,
  final: boolean,
  nextIdx: () => number,
): TranscriptTurn[] {
  const arr = [...prev];
  const last = arr[arr.length - 1];
  if (last && last.role === role && last.interim) {
    arr[arr.length - 1] = { ...last, text, interim: !final };
  } else {
    arr.push({ idx: nextIdx(), role, text, ts: Date.now(), interim: !final });
  }
  return arr;
}

/**
 * Does this VAPI message `type` carry tool/function activity?
 *
 * The explicit names are the shapes VAPI has shipped; we ALSO accept any type
 * whose string contains "tool" or "function" (case-insensitive) so a renamed
 * or newly-added variant doesn't silently drop tool spans on the floor.
 * TODO(vapi-shape): the definitive set needs a live /try smoke test to confirm
 * the exact message `type` values the SDK emits today.
 */
function isToolMessage(type: unknown): boolean {
  if (typeof type !== "string") return false;
  if (
    type === "tool-calls" ||
    type === "tool-calls-result" ||
    type === "tool.completed" ||
    type === "function-call-result"
  ) {
    return true;
  }
  const t = type.toLowerCase();
  return t.includes("tool") || t.includes("function");
}

/**
 * Normalize a VAPI tool-call / tool-result client message into buffered events.
 * VAPI has shipped several shapes; cover the common ones defensively.
 * TODO(vapi-shape): reconcile against live client messages.
 */
function toolEventsFrom(msg: any, ts: number): VapiEvent[] {
  const type = msg?.type as string | undefined;
  const isResult =
    type === "tool-calls-result" || type === "tool.completed" || type === "function-call-result";
  const kind: VapiEvent["type"] = isResult ? "tool-result" : "tool-call";

  const list =
    (msg?.toolCallList as unknown[] | undefined) ??
    (msg?.toolCalls as unknown[] | undefined) ??
    (msg?.toolWithToolCallList as unknown[] | undefined) ??
    (msg?.toolCall ? [msg.toolCall] : undefined) ??
    (msg?.functionCall ? [msg.functionCall] : undefined) ??
    [];

  const out: VapiEvent[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const tc = (prop(raw, "toolCall") as unknown) ?? raw;
    const fn = prop(tc, "function") ?? {};
    const toolName =
      (prop(fn, "name") as string | undefined) ??
      (prop(tc, "name") as string | undefined) ??
      (prop(raw, "name") as string | undefined);
    const toolCallId =
      (prop(tc, "id") as string | undefined) ??
      (prop(raw, "id") as string | undefined) ??
      (prop(raw, "toolCallId") as string | undefined);
    out.push({ ts, type: kind, toolName, toolCallId });
  }
  // Some result messages don't repeat the call list — still record a bare result.
  if (out.length === 0 && isResult) {
    out.push({
      ts,
      type: "tool-result",
      toolCallId: (prop(msg, "toolCallId") as string | undefined) ?? undefined,
    });
  }
  return out;
}

/**
 * Drives the VAPI Web SDK call from local React state (zero network on the render
 * path, per plan §5.3). Live transcript/volume/speech come from SDK events; a 120s
 * client timer backstops the server-side maxDurationSeconds cap.
 *
 * Phase 3: the hook is also the single source of truth for the call's OTel trace.
 * It buffers normalized client events, derives turn/stt/llm/tts + tool spans
 * (relative to call-start), and flushes them — plus the finalized transcript and
 * the deterministic quality metrics — to Convex on a 5s timer and once on call-end.
 */
export function useVapiCall(): VapiCall {
  const [status, setStatus] = React.useState<CallStatus>("idle");
  const [turns, setTurns] = React.useState<TranscriptTurn[]>([]);
  const [volume, setVolume] = React.useState(0);
  const [agentSpeaking, setAgentSpeaking] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(MAX_SECONDS);

  const idxRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const cappedRef = React.useRef(false);

  // ── volume throttle ─────────────────────────────────────────────────────────
  // VAPI fires volume-level tens of times/sec; committing each to state would
  // re-render the whole TryPage per audio frame. Coalesce to ≤1 setState per
  // animation frame (the visualizer can't show more than one frame anyway).
  const pendingVolumeRef = React.useRef<number | null>(null);
  const volumeRafRef = React.useRef<number | null>(null);
  const cancelVolumeRaf = React.useCallback(() => {
    if (volumeRafRef.current != null) {
      cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = null;
    }
    pendingVolumeRef.current = null;
  }, []);

  // ── trace buffers ──────────────────────────────────────────────────────────
  const eventsRef = React.useRef<VapiEvent[]>([]);
  const turnsRef = React.useRef<TranscriptTurn[]>([]);
  const callStartRef = React.useRef<number | null>(null);
  const callIdRef = React.useRef<Id<"calls"> | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const flushTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Ensures the final flush (spans + turns + metrics) runs exactly once, whether
  // it's triggered by the End button (stop) or the SDK's "call-end" event.
  const finalFlushedRef = React.useRef(false);

  const batchWriteSpans = useMutation(api.telemetry.batchWriteSpans);
  const recordTurns = useMutation(api.transcriptTurns.recordTurns);
  const recordQualityMetrics = useMutation(api.calls.recordQualityMetrics);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopFlushTimer = React.useCallback(() => {
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = null;
  }, []);

  /** Derive + persist the trace (and, on final, the quality metrics). */
  const flush = React.useCallback(
    async (final: boolean) => {
      const callId = callIdRef.current;
      const sessionId = sessionIdRef.current;
      const callStartMs = callStartRef.current;
      // DEBUG(spans): guard state + buffer size on every flush
      console.debug("DEBUG(spans) flush", {
        final,
        callId,
        sessionId,
        callStartMs,
        events: eventsRef.current.length,
      });
      if (!callId || !sessionId || callStartMs == null) return;

      const spans = deriveSpansFromEvents(eventsRef.current, {
        traceId: callId,
        callStartMs,
      });
      // DEBUG(spans): how many spans the buffer derived
      console.debug("DEBUG(spans) derived", { spans: spans.length });
      if (spans.length > 0) {
        try {
          await batchWriteSpans({ callId, sessionId, spans });
          // DEBUG(spans): write resolved
          console.debug("DEBUG(spans) batchWriteSpans ok", { spans: spans.length });
        } catch (e) {
          // DEBUG(spans): surface the previously-swallowed write error
          console.error("DEBUG(spans) batchWriteSpans FAILED", e);
        }
      }

      const finalizedTurns = turnsRef.current
        .filter((t) => !t.interim)
        .map((t) => ({ idx: t.idx, role: t.role, text: t.text, ts: t.ts }));
      if (finalizedTurns.length > 0) {
        try {
          await recordTurns({ callId, sessionId, turns: finalizedTurns });
        } catch {
          /* best-effort */
        }
      }

      if (final) {
        const metricTurns = turnsRef.current
          .filter((t) => !t.interim)
          .map((t) => ({ role: t.role, text: t.text }));
        const metricSpans = spans.map((s) => ({
          kind: s.kind,
          startMs: s.startMs,
          endMs: s.endMs,
        }));
        // Pass the raw buffered events so interruptions (barge-ins) can be
        // computed from arrival timestamps — the derived spans are
        // non-overlapping and can't reveal them. See computeQualityMetrics.
        const metrics = computeQualityMetrics(metricTurns, metricSpans, eventsRef.current);
        // Unlike spans/turns above (best-effort, retried next flush), the
        // metrics write only happens on the FINAL flush — there is no next
        // flush. Let it throw so runFinalFlush can surface + retry it.
        await recordQualityMetrics({ callId, sessionId, metrics });
      }
    },
    [batchWriteSpans, recordTurns, recordQualityMetrics],
  );

  /**
   * Persist the final trace + metrics, guarded so it fires at most once per
   * call. Unlike the periodic flush, this is the LAST chance to land the report
   * data — so we await it and, on failure, reset the once-guard and surface the
   * error (via setError) so it's visible and the End button can retry.
   */
  const runFinalFlush = React.useCallback(async () => {
    if (finalFlushedRef.current) return;
    finalFlushedRef.current = true;
    try {
      await flush(true);
    } catch {
      // Re-open the guard so a subsequent End/call-end can retry the flush,
      // and surface the failure rather than silently dropping the report.
      finalFlushedRef.current = false;
      setError("Couldn't save the call report — it may be incomplete. Please retry.");
    }
  }, [flush]);

  const startTimer = React.useCallback(() => {
    stopTimer();
    cappedRef.current = false;
    setSecondsLeft(MAX_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next === 15 && !cappedRef.current) {
          cappedRef.current = true;
          notifyTimeCap(15);
        }
        if (next <= 0) {
          try {
            getVapi().stop();
          } catch {
            /* noop */
          }
          stopTimer();
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [stopTimer]);

  React.useEffect(() => {
    const vapi = getVapi();
    const onCallStart = () => {
      setStatus("live");
      callStartRef.current = Date.now();
      // DEBUG(spans): call-start fired; trace clock anchored
      console.debug("DEBUG(spans) call-start", {
        callId: callIdRef.current,
        sessionId: sessionIdRef.current,
        callStartMs: callStartRef.current,
      });
      startTimer();
      // Periodic trace flush (off the audio render path).
      stopFlushTimer();
      flushTimerRef.current = setInterval(() => {
        void flush(false);
      }, FLUSH_INTERVAL_MS);
    };
    const onCallEnd = () => {
      // DEBUG(spans): call-end fired; final flush about to run
      console.debug("DEBUG(spans) call-end", { events: eventsRef.current.length });
      setStatus("ended");
      setAgentSpeaking(false);
      cancelVolumeRaf();
      setVolume(0);
      stopTimer();
      stopFlushTimer();
      // Final flush: spans + finalized turns + quality metrics (no-op if End
      // already triggered it). It handles its own errors (resets the guard +
      // setError on failure), so fire-and-forget is safe here.
      void runFinalFlush();
    };
    const onSpeechStart = () => setAgentSpeaking(true);
    const onSpeechEnd = () => setAgentSpeaking(false);
    // Throttle to one commit per animation frame: stash the latest value and
    // flush it on the next frame, coalescing the burst of intra-frame events.
    const onVolume = (v: number) => {
      pendingVolumeRef.current = typeof v === "number" ? v : 0;
      if (volumeRafRef.current != null) return;
      volumeRafRef.current = requestAnimationFrame(() => {
        volumeRafRef.current = null;
        const next = pendingVolumeRef.current;
        pendingVolumeRef.current = null;
        if (next != null) setVolume(next);
      });
    };
    const onError = (e: any) =>
      setError(e?.message ?? e?.error?.message ?? e?.errorMsg ?? "Call error — please retry.");
    const onMessage = (msg: any) => {
      const now = Date.now();
      // DEBUG(spans): every client-message type the SDK actually delivers live
      console.debug("DEBUG(spans) message", {
        type: msg?.type,
        hasTranscript: !!msg?.transcript,
        transcriptType: msg?.transcriptType,
        role: msg?.role,
      });
      if (msg?.type === "transcript" && msg.transcript) {
        const role = msg.role === "assistant" ? "assistant" : "user";
        const final = msg.transcriptType === "final";
        eventsRef.current.push({ ts: now, type: "transcript", role, final, text: msg.transcript });
        // DEBUG(spans): transcript buffered
        console.debug("DEBUG(spans) buffered transcript", {
          role,
          final,
          events: eventsRef.current.length,
        });
        setTurns((prev) => {
          const next = applyTranscript(prev, role, msg.transcript, final, () => idxRef.current++);
          turnsRef.current = next;
          return next;
        });
      } else if (isToolMessage(msg?.type)) {
        eventsRef.current.push(...toolEventsFrom(msg, now));
      }
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("volume-level", onVolume);
    vapi.on("message", onMessage);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("volume-level", onVolume);
      vapi.off("message", onMessage);
      vapi.off("error", onError);
      stopTimer();
      stopFlushTimer();
      cancelVolumeRaf();
    };
  }, [startTimer, stopTimer, stopFlushTimer, flush, runFinalFlush, cancelVolumeRaf]);

  const start = React.useCallback(
    async (assistant: unknown, callId: string, sessionId: string): Promise<string | null> => {
      setError(null);
      setTurns([]);
      idxRef.current = 0;
      // Clear any leftover flush interval from a previous call before installing
      // the new call's state, so a stale tick can't fire against the new callId.
      stopFlushTimer();
      // reset trace buffers for the new call
      eventsRef.current = [];
      turnsRef.current = [];
      callStartRef.current = null;
      finalFlushedRef.current = false;
      callIdRef.current = callId as Id<"calls">;
      sessionIdRef.current = sessionId;
      setStatus("connecting");
      try {
        const res = await getVapi().start(assistant as any);
        return (res as any)?.id ?? null;
      } catch (e: any) {
        setError(e?.message ?? "Couldn't start the call.");
        setStatus("idle");
        return null;
      }
    },
    [stopFlushTimer],
  );

  const stop = React.useCallback(() => {
    // Optimistic teardown: flip the UI to "ended" immediately rather than waiting
    // on the SDK's "call-end" event, which can be delayed, dropped, or throw —
    // leaving the End button looking dead. The later "call-end" just reaffirms this.
    setStatus((s) => (s === "live" || s === "connecting" ? "ended" : s));
    setAgentSpeaking(false);
    cancelVolumeRaf();
    setVolume(0);
    stopTimer();
    stopFlushTimer();
    // Persist the final trace + metrics now, so they land even if "call-end"
    // never fires. runFinalFlush handles its own errors (guard reset + setError).
    void runFinalFlush();
    try {
      getVapi().stop();
    } catch {
      // Don't swallow teardown failures silently — surface so they're detectable.
      setError("Couldn't cleanly end the call — it may take a moment to disconnect.");
    }
  }, [stopTimer, stopFlushTimer, runFinalFlush, cancelVolumeRaf]);

  const toggleMute = React.useCallback(() => {
    const vapi = getVapi();
    const next = !vapi.isMuted();
    vapi.setMuted(next);
    setMuted(next);
  }, []);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setTurns([]);
    cancelVolumeRaf();
    setVolume(0);
    setError(null);
    setSecondsLeft(MAX_SECONDS);
    eventsRef.current = [];
    turnsRef.current = [];
    callStartRef.current = null;
    callIdRef.current = null;
    sessionIdRef.current = null;
    finalFlushedRef.current = false;
  }, [cancelVolumeRaf]);

  return {
    status,
    inProgress: callIsBusy(status),
    turns,
    volume,
    agentSpeaking,
    muted,
    error,
    secondsLeft,
    start,
    stop,
    toggleMute,
    reset,
  };
}
