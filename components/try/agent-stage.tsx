"use client";

import * as React from "react";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { VoiceVisualizer } from "@/components/shared/voice-visualizer";
import type { CallStatus } from "@/lib/types";

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Ready when you are",
  connecting: "Connecting…",
  live: "Listening",
  ended: "Call ended",
};

/**
 * AgentStage — real-data voice visualizer stage. VoiceVisualizer is driven by the
 * SDK volume level + agentSpeaking; speaking/listening/connecting states are visually
 * distinct. Motion is disabled under reduced-motion (global guard).
 *
 * Wrapped in React.memo: `volume` updates ~once/animation-frame during a call
 * (throttled in useVapiCall). Memoizing keeps those frequent volume changes from
 * forcing the rest of TryPage to re-render — only this component does.
 */
function AgentStageImpl({
  status,
  volume,
  agentSpeaking,
  language = "EN",
  className,
}: {
  status: CallStatus;
  volume: number;
  agentSpeaking: boolean;
  language?: string;
  className?: string;
}) {
  const live = status === "live";
  const connecting = status === "connecting";
  const ended = status === "ended";

  return (
    <div className={cn("relative flex flex-1 flex-col items-center justify-center gap-8 p-6", className)}>
      <span className="absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {language}
      </span>

      <div className="relative flex items-center justify-center">
        {connecting && (
          <span className="pointer-events-none absolute inset-0 m-auto size-32 animate-pulse-ring rounded-full bg-primary/40" />
        )}
        {ended ? (
          // Settled "done" state — a calm neutral disc, not the live orb left
          // dimmed and frozen mid-equalizer (which read as a stalled animation).
          <div className="flex size-36 items-center justify-center rounded-full border bg-muted">
            <Check className="size-12 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex size-36 items-center justify-center">
            <VoiceVisualizer
              mode="live"
              level={volume}
              speaking={agentSpeaking}
              active={live}
              className="w-full"
            />
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium">
          {live ? (agentSpeaking ? "Receptionist speaking…" : STATUS_LABEL.live) : STATUS_LABEL[status]}
        </p>
        {status === "idle" && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">Pick a business, then press Talk</p>
        )}
      </div>
    </div>
  );
}

export const AgentStage = React.memo(AgentStageImpl);
