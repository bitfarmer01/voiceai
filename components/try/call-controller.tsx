"use client";

import { Mic, MicOff, PhoneOff, Phone, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CallStatusBadge } from "@/components/shared/status-badge";
import { formatDuration } from "@/lib/format";
import type { CallStatus } from "@/lib/types";

const MAX = 120;

/**
 * CallController — Talk/End with a 120s countdown ring, mute toggle, and the frozen
 * status pill. Owns no call logic; it just renders state + fires callbacks.
 */
export function CallController({
  status,
  secondsLeft,
  muted,
  disabled,
  onTalk,
  onEnd,
  onToggleMute,
}: {
  status: CallStatus;
  secondsLeft: number;
  muted: boolean;
  disabled?: boolean;
  onTalk: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
}) {
  const active = status === "live" || status === "connecting";
  const ringPct = secondsLeft / MAX;
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center gap-4">
      <CallStatusBadge status={status} />

      <div className="flex items-center gap-4">
        {active && (
          <Button
            variant="outline"
            size="icon"
            className="size-11 rounded-full"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="size-4 text-danger" /> : <Mic className="size-4" />}
          </Button>
        )}

        <div className="relative">
          {status === "live" && (
            <svg className="absolute -inset-1.5 -rotate-90" width="92" height="92" viewBox="0 0 92 92" aria-hidden>
              <circle cx="46" cy="46" r={R} fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="46"
                cy="46"
                r={R}
                fill="none"
                stroke={secondsLeft <= 15 ? "var(--danger)" : "var(--primary)"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - ringPct)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
          )}
          {active ? (
            <Button
              size="icon"
              variant="destructive"
              className="size-16 rounded-full"
              onClick={onEnd}
              aria-label="End call"
            >
              {status === "connecting" ? <Loader2 className="size-6 animate-spin" /> : <PhoneOff className="size-6" />}
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-16 rounded-full"
              onClick={onTalk}
              disabled={disabled}
              aria-label="Start call"
            >
              <Phone className="size-6" />
            </Button>
          )}
        </div>

        {active && (
          <span className={cn("w-12 font-mono text-sm tabular-nums", secondsLeft <= 15 ? "text-danger" : "text-muted-foreground")}>
            {formatDuration(secondsLeft)}
          </span>
        )}
      </div>

      {status === "idle" && <p className="text-xs text-muted-foreground">Talk · 120-second demo · mic asked once</p>}
      {status === "ended" && (
        <Button variant="link" size="sm" onClick={onTalk}>
          Start another call
        </Button>
      )}
    </div>
  );
}
