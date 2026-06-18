"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import type { CostBreakdown as CostBreakdownData } from "@/lib/types";

const SEGMENTS: { key: keyof CostBreakdownData; label: string; cls: string }[] = [
  { key: "stt", label: "STT", cls: "bg-foreground/20" },
  { key: "llm", label: "LLM", cls: "bg-foreground/35" },
  { key: "tts", label: "TTS", cls: "bg-foreground/50" },
  { key: "platform", label: "Platform", cls: "bg-foreground/65" },
];

/**
 * CostBreakdown — stacked cost bar (stt/llm/tts/platform) that sums to the header
 * total. Absolute / percent toggle. Appears on Try It (live ticker), Report, Admin.
 */
export function CostBreakdown({
  cost,
  className,
  defaultMode = "absolute",
}: {
  cost: CostBreakdownData;
  className?: string;
  defaultMode?: "absolute" | "percent";
}) {
  const [mode, setMode] = React.useState<"absolute" | "percent">(defaultMode);
  const total = cost.stt + cost.llm + cost.tts + cost.platform;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm tabular-nums">{formatUsd(total, 3)}</span>
        <div className="flex rounded-md border p-0.5 text-[11px]">
          {(["absolute", "percent"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2 py-0.5 capitalize transition-colors",
                mode === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "absolute" ? "$" : "%"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        {SEGMENTS.map((s) => (
          <div key={s.key} className={s.cls} style={{ width: `${pct(cost[s.key])}%` }} title={`${s.label}: ${formatUsd(cost[s.key], 3)}`} />
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs">
            <span className={cn("size-2 rounded-sm", s.cls)} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-mono tabular-nums">
              {mode === "absolute" ? formatUsd(cost[s.key], 3) : `${Math.round(pct(cost[s.key]))}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
