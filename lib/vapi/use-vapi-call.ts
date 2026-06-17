"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getVapi } from "./client";
import { notifyTimeCap } from "@/components/states/guard-panels";
import { deriveSpansFromEvents, type VapiEvent } from "./derive-spans";
import { computeQualityMetrics } from "@/lib/calls/quality-metrics";
import type { CallStatus, TranscriptTurn } from "@/lib/types";

const MAX_SECONDS = 120;
/** How often we flush the buffered trace to Convex during a live call. */
const FLUSH_INTERVAL_MS = 5000;

export interface VapiCall {
  status: CallStatus;
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

/** Safely read a property off an unknown object. */
function prop(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
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

  // ── trace buffers ──────────────────────────────────────────────────────────
  const eventsRef = React.useRef<VapiEvent[]>([]);
  const turnsRef = React.useRef<TranscriptTurn[]>([]);
  const callStartRef = React.useRef<number | null>(null);
  const callIdRef = React.useRef<Id<"calls"> | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const flushTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (!callId || !sessionId || callStartMs == null) return;

      const spans = deriveSpansFromEvents(eventsRef.current, {
        traceId: callId,
        callStartMs,
      });
      if (spans.length > 0) {
        try {
          await batchWriteSpans({ callId, sessionId, spans });
        } catch {
          /* best-effort telemetry; the buffer is kept for the next flush */
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
        const metrics = computeQualityMetrics(metricTurns, metricSpans);
        try {
          await recordQualityMetrics({ callId, sessionId, metrics });
        } catch {
          /* best-effort */
        }
      }
    },
    [batchWriteSpans, recordTurns, recordQualityMetrics],
  );

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
      startTimer();
      // Periodic trace flush (off the audio render path).
      stopFlushTimer();
      flushTimerRef.current = setInterval(() => {
        void flush(false);
      }, FLUSH_INTERVAL_MS);
    };
    const onCallEnd = () => {
      setStatus("ended");
      setAgentSpeaking(false);
      setVolume(0);
      stopTimer();
      stopFlushTimer();
      // Final flush: spans + finalized turns + quality metrics.
      void flush(true);
    };
    const onSpeechStart = () => setAgentSpeaking(true);
    const onSpeechEnd = () => setAgentSpeaking(false);
    const onVolume = (v: number) => setVolume(typeof v === "number" ? v : 0);
    const onError = (e: any) =>
      setError(e?.message ?? e?.error?.message ?? e?.errorMsg ?? "Call error — please retry.");
    const onMessage = (msg: any) => {
      const now = Date.now();
      if (msg?.type === "transcript" && msg.transcript) {
        const role = msg.role === "assistant" ? "assistant" : "user";
        const final = msg.transcriptType === "final";
        eventsRef.current.push({ ts: now, type: "transcript", role, final, text: msg.transcript });
        setTurns((prev) => {
          const next = applyTranscript(prev, role, msg.transcript, final, () => idxRef.current++);
          turnsRef.current = next;
          return next;
        });
      } else if (
        msg?.type === "tool-calls" ||
        msg?.type === "tool-calls-result" ||
        msg?.type === "tool.completed" ||
        msg?.type === "function-call-result"
      ) {
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
    };
  }, [startTimer, stopTimer, stopFlushTimer, flush]);

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
    try {
      getVapi().stop();
    } catch {
      /* noop */
    }
  }, []);

  const toggleMute = React.useCallback(() => {
    const vapi = getVapi();
    const next = !vapi.isMuted();
    vapi.setMuted(next);
    setMuted(next);
  }, []);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setTurns([]);
    setVolume(0);
    setError(null);
    setSecondsLeft(MAX_SECONDS);
    eventsRef.current = [];
    turnsRef.current = [];
    callStartRef.current = null;
    callIdRef.current = null;
    sessionIdRef.current = null;
  }, []);

  return { status, turns, volume, agentSpeaking, muted, error, secondsLeft, start, stop, toggleMute, reset };
}
