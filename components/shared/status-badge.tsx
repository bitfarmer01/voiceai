import {
  CheckCircle,
  Circle,
  PhoneSlash,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import type { CallStatus, EvalStatus } from "@/lib/types";

function CircleFill({ className }: { className?: string }) {
  return <Circle weight="fill" className={className} />;
}

/**
 * Frozen StatusBadge vocabulary (ui-development-plan.md §2). Icon + label are ALWAYS
 * paired so meaning never depends on colour alone (WCAG / colour-blind safe).
 */

const base =
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium";

const CALL: Record<CallStatus, { label: string; cls: string; icon: React.ElementType; pulse?: boolean }> = {
  idle: { label: "Idle", cls: "border-border bg-muted text-muted-foreground", icon: Circle },
  connecting: { label: "Connecting", cls: "border-info/20 bg-info-subtle text-info", icon: CircleFill, pulse: true },
  live: { label: "Live", cls: "border-success/20 bg-success-subtle text-success", icon: CircleFill, pulse: true },
  ended: { label: "Ended", cls: "border-border bg-muted text-muted-foreground", icon: PhoneSlash },
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
      {pass ? <CheckCircle className="size-3" /> : <XCircle className="size-3" />}
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}
