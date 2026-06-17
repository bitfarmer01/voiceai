import * as React from "react";
import { cn } from "@/lib/utils";

/** The four deterministic metrics persisted on the call (sentiment deferred). */
export interface QualityMetricsData {
  talkRatio: number;
  interruptions: number;
  deadAirSec: number;
  wpm: number;
  sentiment?: number;
}

const ROWS: {
  key: keyof QualityMetricsData;
  label: string;
  hint: string;
  fmt: (v: number) => string;
}[] = [
  { key: "talkRatio", label: "Talk ratio", hint: "agent share", fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "wpm", label: "Words / min", hint: "agent pace", fmt: (v) => `${Math.round(v)}` },
  { key: "interruptions", label: "Interruptions", hint: "barge-ins", fmt: (v) => `${v}` },
  { key: "deadAirSec", label: "Dead air", hint: "total silence", fmt: (v) => `${v.toFixed(1)}s` },
];

/**
 * QualityMetricsPanel — the four deterministic call-quality metrics, mirroring
 * the Pipeline/CostBreakdown panel style. Sentiment is shown as a deferred row.
 */
export function QualityMetricsPanel({
  metrics,
  className,
}: {
  metrics: QualityMetricsData;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {ROWS.map((r) => (
        <li key={r.key} className="flex items-baseline gap-2 text-xs">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="text-muted-foreground/50">· {r.hint}</span>
          <span className="ml-auto font-mono tabular-nums text-foreground">
            {r.fmt((metrics[r.key] as number) ?? 0)}
          </span>
        </li>
      ))}
      <li className="flex items-baseline gap-2 text-xs">
        <span className="text-muted-foreground">Sentiment</span>
        <span className="ml-auto font-mono text-muted-foreground/60">coming soon</span>
      </li>
    </ul>
  );
}
