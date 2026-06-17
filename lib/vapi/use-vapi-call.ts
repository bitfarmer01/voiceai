"use client";

import * as React from "react";
import { getVapi } from "./client";
import { notifyTimeCap } from "@/components/states/guard-panels";
import type { CallStatus, TranscriptTurn } from "@/lib/types";

const MAX_SECONDS = 120;

export interface VapiCall {
  status: CallStatus;
  turns: TranscriptTurn[];
  volume: number;
  agentSpeaking: boolean;
  muted: boolean;
  error: string | null;
  secondsLeft: number;
  start: (assistant: unknown) => Promise<string | null>;
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
 * Drives the VAPI Web SDK call from local React state (zero network on the render
 * path, per plan §5.3). Live transcript/volume/speech come from SDK events; a 120s
 * client timer backstops the server-side maxDurationSeconds cap.
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

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

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
      startTimer();
    };
    const onCallEnd = () => {
      setStatus("ended");
      setAgentSpeaking(false);
      setVolume(0);
      stopTimer();
    };
    const onSpeechStart = () => setAgentSpeaking(true);
    const onSpeechEnd = () => setAgentSpeaking(false);
    const onVolume = (v: number) => setVolume(typeof v === "number" ? v : 0);
    const onError = (e: any) =>
      setError(e?.message ?? e?.error?.message ?? e?.errorMsg ?? "Call error — please retry.");
    const onMessage = (msg: any) => {
      if (msg?.type === "transcript" && msg.transcript) {
        const role = msg.role === "assistant" ? "assistant" : "user";
        setTurns((prev) => applyTranscript(prev, role, msg.transcript, msg.transcriptType === "final", () => idxRef.current++));
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
    };
  }, [startTimer, stopTimer]);

  const start = React.useCallback(async (assistant: unknown): Promise<string | null> => {
    setError(null);
    setTurns([]);
    idxRef.current = 0;
    setStatus("connecting");
    try {
      const res = await getVapi().start(assistant as any);
      return (res as any)?.id ?? null;
    } catch (e: any) {
      setError(e?.message ?? "Couldn't start the call.");
      setStatus("idle");
      return null;
    }
  }, []);

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
  }, []);

  return { status, turns, volume, agentSpeaking, muted, error, secondsLeft, start, stop, toggleMute, reset };
}
