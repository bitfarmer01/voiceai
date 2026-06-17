import {
  Bookmark,
  CheckCircle2,
  Circle,
  CircleDot,
  PhoneOff,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallStatus, CallOutcome, EvalStatus } from "@/lib/types";

/**
 * Frozen StatusBadge vocabulary (ui-development-plan.md §2). Icon + label are ALWAYS
 * paired so meaning never depends on colour alone (WCAG / colour-blind safe).
 */

const base =
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium";

const CALL: Record<CallStatus, { label: string; cls: string; icon: React.ElementType; pulse?: boolean }> = {
  idle: { label: "Idle", cls: "border-border bg-muted text-muted-foreground", icon: Circle },
  connecting: { label: "Connecting", cls: "border-info/20 bg-info-subtle text-info", icon: CircleDot, pulse: true },
  live: { label: "Live", cls: "border-success/20 bg-success-subtle text-success", icon: CircleDot, pulse: true },
  ended: { label: "Ended", cls: "border-border bg-muted text-muted-foreground", icon: PhoneOff },
};

export function CallStatusBadge({ status, className }: { status: CallStatus; className?: string }) {
  const s = CALL[status];
  const Icon = s.icon;
  return (
    <span className={cn(base, s.cls, className)}>
      <Icon className={cn("size-3", s.pulse && "animate-pulse")} />
      {s.label}
    </span>
  );
}

const OUTCOME: Record<CallOutcome, { label: string; cls: string; icon: React.ElementType }> = {
  booked: { label: "Booked", cls: "border-success/20 bg-success-subtle text-success", icon: CheckCircle2 },
  intent: { label: "Intent", cls: "border-info/20 bg-info-subtle text-info", icon: Bookmark },
  abandoned: { label: "Abandoned", cls: "border-warning/20 bg-warning-subtle text-warning", icon: Circle },
};

export function OutcomeBadge({ outcome, className }: { outcome: CallOutcome; className?: string }) {
  const o = OUTCOME[outcome];
  const Icon = o.icon;
  return (
    <span className={cn(base, o.cls, className)}>
      <Icon className="size-3" />
      {o.label}
    </span>
  );
}

export function EvalBadge({ status, className }: { status: EvalStatus; className?: string }) {
  const pass = status === "pass";
  return (
    <span
      className={cn(
        base,
        pass ? "border-success/20 bg-success-subtle text-success" : "border-danger/20 bg-danger-subtle text-danger",
        className,
      )}
    >
      {pass ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}
