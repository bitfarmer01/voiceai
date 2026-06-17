"use client";

import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMs, latencyTextClass } from "@/lib/format";
import { EvalBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EvalStatus } from "@/lib/types";

export interface EvalRow {
  id: string;
  scenario: string;
  category: string;
  status: EvalStatus;
  taskSuccess: number; // 0..1
  grounding: number; // 0..1
  latencyMs: number;
  deltaVsBaseline?: number; // signed score delta
  regressed?: boolean;
  running?: boolean;
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

/**
 * EvalResults — scenario results table with PASS/FAIL pills, task-success, grounding,
 * latency, and a Δ-vs-baseline column. Regressed rows get a red left-border + tint so
 * regressions are visually unmistakable. Streams live (per-row spinner) during a run.
 */
export function EvalResults({ rows, onRowClick }: { rows: EvalRow[]; onRowClick?: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scenario</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Task</TableHead>
            <TableHead className="text-right">Grounding</TableHead>
            <TableHead className="text-right">Latency</TableHead>
            <TableHead className="text-right">Δ baseline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              onClick={() => onRowClick?.(r.id)}
              className={cn(
                onRowClick && "cursor-pointer",
                r.regressed && "border-l-2 border-l-danger bg-danger-subtle/30",
              )}
            >
              <TableCell>
                <div className="font-medium">{r.scenario}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {r.category}
                </div>
              </TableCell>
              <TableCell>
                {r.running ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Running
                  </span>
                ) : (
                  <EvalBadge status={r.status} />
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">{pct(r.taskSuccess)}</TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">{pct(r.grounding)}</TableCell>
              <TableCell className={cn("text-right font-mono text-sm tabular-nums", latencyTextClass(r.latencyMs))}>
                {formatMs(r.latencyMs)}
              </TableCell>
              <TableCell className="text-right">
                {r.deltaVsBaseline === undefined ? (
                  <span className="font-mono text-xs text-muted-foreground">—</span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center justify-end gap-1 font-mono text-xs tabular-nums",
                      r.deltaVsBaseline < 0 ? "text-danger" : r.deltaVsBaseline > 0 ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {r.deltaVsBaseline < 0 ? <TrendingDown className="size-3" /> : r.deltaVsBaseline > 0 ? <TrendingUp className="size-3" /> : null}
                    {r.deltaVsBaseline > 0 ? "+" : ""}
                    {Math.round(r.deltaVsBaseline * 100)}%
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
