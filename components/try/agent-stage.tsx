"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallStatus } from "@/lib/types";

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Ready when you are",
  connecting: "Connecting…",
  live: "Listening",
  ended: "Call ended",
};

/**
 * AgentStage — amplitude-reactive agent orb. Glow + equalizer bars scale with the
 * SDK volume level; speaking/listening/connecting states are visually distinct.
 * Motion is disabled under reduced-motion (global guard).
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
  const glow = live ? 24 + volume * 60 : 18;
  const spread = live ? 4 + volume * 18 : 4;

  return (
    <div className={cn("relative flex flex-1 flex-col items-center justify-center gap-8 p-6", className)}>
      <span className="absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {language}
      </span>

      <div className="relative flex items-center justify-center">
        {connecting && (
          <span className="absolute size-32 animate-pulse-ring rounded-full bg-primary/40" />
        )}
        {ended ? (
          // Settled "done" state — a calm neutral disc, not the live orb left
          // dimmed and frozen mid-equalizer (which read as a stalled animation).
          <div className="flex size-36 items-center justify-center rounded-full border bg-muted">
            <Check className="size-12 text-muted-foreground" />
          </div>
        ) : (
          <div
            className={cn(
              "relative flex size-36 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 transition-[box-shadow,transform] duration-150",
              !live && "opacity-80",
            )}
            style={{
              boxShadow: `0 0 ${glow}px ${spread}px color-mix(in oklab, var(--primary) ${live ? 35 : 18}%, transparent)`,
              transform: live ? `scale(${1 + volume * 0.08})` : "scale(1)",
            }}
          >
            <div className="flex h-10 items-end gap-1.5">
              {[0.55, 0.85, 1, 0.7, 0.5].map((d, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-white/85"
                  style={
                    live && agentSpeaking
                      ? { height: "100%", animation: `eq-bar ${0.7 + i * 0.13}s ease-in-out infinite alternate`, transformOrigin: "bottom" }
                      : { height: `${(live ? 0.3 + volume * 0.7 : 0.3) * d * 100}%`, transformOrigin: "bottom", transition: "height 120ms" }
                  }
                />
              ))}
            </div>
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
