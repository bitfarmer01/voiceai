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

// 1 — Too many calls at once
export function DemoBusyPanel({ slots = 3 }: { slots?: number }) {
  return (
    <GuardPanel
      tone="info"
      icon={Users}
      title="The demo's busy right now"
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/calls">See past calls while you wait</Link>
        </Button>
      }
    >
      We keep only {slots} demo calls going at once so it stays free for everyone. Hang on a moment and try again.
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

// 3 — Daily spending limit
export function DailyBudgetPanel() {
  return (
    <GuardPanel tone="warning" icon={Wallet} title="That's the demo's spending limit for today">
      We set a small daily limit so the demo stays free. Please try again tomorrow — you can still
      look back at past calls in the meantime.
    </GuardPanel>
  );
}

// 4 — Total spending limit
export function TotalBudgetPanel() {
  return (
    <GuardPanel
      tone="danger"
      icon={Trophy}
      title="The demo has reached its overall spending limit"
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/calls">Look back at past calls</Link>
        </Button>
      }
    >
      New calls are paused for now, but you can still look back at every past call.
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
        Click the mic/lock icon in your browser&apos;s address bar → allow microphone → reload.
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
            This demo records the call so it can write up a summary for you afterward. Personal
            details are kept private, and the recording is deleted automatically after 24 hours.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>I understand this call is recorded for the demo and is deleted after 24 hours.</span>
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
    description: `This demo call ends in ${secondsLeft}s. Your summary will be ready right after.`,
    duration: 6000,
  });
}
