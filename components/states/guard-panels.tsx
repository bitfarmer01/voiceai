"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clock, Microphone, MicrophoneSlash, Trophy, Users, Wallet } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCountdown } from "@/lib/format";

type Tone = "info" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  info: "border-info/20 bg-info-subtle text-info",
  warning: "border-warning/20 bg-warning-subtle text-warning",
  danger: "border-danger/20 bg-danger-subtle text-danger",
};

/** Base calm-but-branded guard banner. */
export function GuardPanel({
  tone,
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone: Tone;
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-4", TONE[tone], className)} role="status">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {children && <div className="mt-1 text-sm text-foreground/80">{children}</div>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

// 1 — Concurrency
export function DemoBusyPanel({ slots = 3 }: { slots?: number }) {
  return (
    <GuardPanel
      tone="info"
      icon={Users}
      title="Demo's busy — all live slots are in use"
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/leaderboard">Watch the leaderboard while you wait</Link>
        </Button>
      }
    >
      All {slots} live lines are taken right now. You may be placed in a short queue.
    </GuardPanel>
  );
}

// 2 — Per-visitor cap
export function VisitorCapPanel({ resetsInMs }: { resetsInMs: number }) {
  return (
    <GuardPanel tone="warning" icon={Clock} title="You've used both of your free calls today">
      That keeps this demo free for everyone. Resets in{" "}
      <span className="font-mono tabular-nums">{formatCountdown(resetsInMs)}</span>.
    </GuardPanel>
  );
}

// 3 — Daily budget
export function DailyBudgetPanel() {
  return (
    <GuardPanel tone="warning" icon={Wallet} title="$8 daily budget reached">
      We cap daily spend to keep this demo free. Try again tomorrow. You can still browse past calls
      and provider comparisons.
    </GuardPanel>
  );
}

// 4 — Total budget
export function TotalBudgetPanel() {
  return (
    <GuardPanel
      tone="danger"
      icon={Trophy}
      title="We've reached the $40 global budget"
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/leaderboard">Explore the read-only data</Link>
        </Button>
      }
    >
      Voice is paused for now, but you can still browse all the past calls and comparisons.
    </GuardPanel>
  );
}

// 5 — Mic permission (denied recovery)
export function MicPermissionPanel({ denied = false, onRequest }: { denied?: boolean; onRequest?: () => void }) {
  if (denied) {
    return (
      <GuardPanel
        tone="danger"
        icon={MicrophoneSlash}
        title="Microphone access is blocked"
        action={
          <Button variant="outline" size="sm" onClick={onRequest}>
            Try again
          </Button>
        }
      >
        Click the mic/lock icon in your browser's address bar → allow microphone → reload.
      </GuardPanel>
    );
  }
  return (
    <GuardPanel
      tone="info"
      icon={Microphone}
      title="Microphone needed"
      action={
        <Button size="sm" onClick={onRequest}>
          Allow microphone
        </Button>
      }
    >
      We ask once, only for the live call. Nothing is recorded without your consent.
    </GuardPanel>
  );
}

// 6 — Recording consent (first-call modal)
export function ConsentDialog({
  open,
  onOpenChange,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAccept: () => void;
}) {
  const [checked, setChecked] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Before we start the call</DialogTitle>
          <DialogDescription>
            This demo records the call to produce your transcript and a replay. PII is
            redacted before logging and everything auto-purges after 24 hours.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>I understand this call is recorded for the demo and will auto-purge in 24h.</span>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!checked}
            onClick={() => {
              onAccept();
              onOpenChange(false);
            }}
          >
            I understand, start call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 7 — Time cap (in-call 120s wrap-up toast)
export function notifyTimeCap(secondsLeft = 15) {
  toast.warning("Wrapping up soon", {
    description: `This demo call ends in ${secondsLeft}s. Your report will be ready right after.`,
    duration: 6000,
  });
}
