"use client";

import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import type { BudgetState } from "@/lib/types";

type Health = "healthy" | "warning" | "reached";

function health(spent: number, cap: number): Health {
  const pct = cap > 0 ? spent / cap : 0;
  if (pct >= 1) return "reached";
  if (pct >= 0.8) return "warning";
  return "healthy";
}

const DOT: Record<Health, string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  reached: "bg-danger",
};
const FILL: Record<Health, string> = {
  healthy: "bg-primary",
  warning: "bg-warning",
  reached: "bg-danger",
};

/**
 * BudgetMeter — shared contract component (appears in TopNav, Try It, Analytics, Admin).
 * `pill` is the compact nav variant; `full` shows the $40 global + $8/day sub-cap.
 * `estimate` renders the "est." treatment for the live (pre-reconcile) mid-call meter.
 */
export function BudgetMeter({
  budget,
  variant = "full",
  estimate = false,
  className,
}: {
  budget: BudgetState;
  variant?: "pill" | "full";
  estimate?: boolean;
  className?: string;
}) {
  const h = health(budget.totalSpentUsd, budget.totalCapUsd);
  const totalPct = Math.min(100, (budget.totalSpentUsd / budget.totalCapUsd) * 100);
  const dayPct = Math.min(100, (budget.daySpentUsd / budget.dayCapUsd) * 100);

  if (variant === "pill") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5",
          className,
        )}
        title={`Global spend ${formatUsd(budget.totalSpentUsd)} of ${formatUsd(budget.totalCapUsd)}`}
      >
        <span className={cn("h-2 w-2 rounded-full", DOT[h])} aria-hidden />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatUsd(budget.totalSpentUsd)} / {formatUsd(budget.totalCapUsd, 0)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {estimate ? "Spend (est.)" : "Spend"}
        </span>
        <span className="font-mono text-sm tabular-nums">
          {formatUsd(budget.totalSpentUsd)}{" "}
          <span className="text-muted-foreground">/ {formatUsd(budget.totalCapUsd, 0)}</span>
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full border bg-secondary">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", FILL[h])}
          style={{ width: `${totalPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>
          Today {formatUsd(budget.daySpentUsd)} / {formatUsd(budget.dayCapUsd, 0)} ({Math.round(dayPct)}%)
        </span>
        <span>
          {budget.activeCalls}/{budget.maxConcurrent} live
        </span>
      </div>

      {h === "reached" && (
        <p className="rounded-md bg-danger-subtle px-3 py-2 text-xs font-medium text-danger">
          Budget reached — new calls are blocked. Every benchmark, trace, and eval is still explorable.
        </p>
      )}
    </div>
  );
}
