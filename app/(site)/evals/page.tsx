"use client";

import { Flask, Info, TrendDown } from "@phosphor-icons/react";
import { EvalBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STUB_RUNS = [
  {
    id: "run1",
    timestamp: "2026-06-17 14:30",
    status: "pass" as const,
    passRate: 0.8,
    groundingScore: 0.94,
    p50LatencyMs: 725,
  },
  {
    id: "run2",
    timestamp: "2026-06-17 12:15",
    status: "pass" as const,
    passRate: 0.8,
    groundingScore: 0.93,
    p50LatencyMs: 710,
  },
  {
    id: "run3",
    timestamp: "2026-06-17 09:45",
    status: "fail" as const,
    passRate: 0.6,
    groundingScore: 0.71,
    p50LatencyMs: 950,
  },
];

export default function EvalsPage() {
  const latestRun = STUB_RUNS[0];
  const failCount = STUB_RUNS.filter((r) => r.status === "fail").length;
  const hasRegression = failCount > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start gap-3">
        <Flask className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-balance">Eval Harness</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Scripted scenarios scored for grounding, task success, and regressions.
          </p>
        </div>
      </div>

      {/* This page is a non-functional preview: the numbers below are an illustrative
          sample, not a live eval run. Make that unmistakable up front. */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border bg-secondary/40 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-pretty text-muted-foreground">
          <span className="font-medium text-foreground">Sample data.</span> This page shows an
          illustrative eval run, not live results — the eval harness isn&apos;t wired to a backend yet.
        </p>
      </div>

      {hasRegression && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border bg-muted/40 px-4 py-3">
          <TrendDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-pretty text-muted-foreground">
            <span className="font-medium text-foreground">Regression detected (sample).</span> In a
            live run, this banner flags when the latest run falls below baseline.
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Pass rate" value={`${Math.round(latestRun.passRate * 100)}%`} />
        <KpiTile label="Grounding score" value={`${Math.round(latestRun.groundingScore * 100)}%`} />
        <KpiTile label="p50 latency" value={`${latestRun.p50LatencyMs}ms`} />
        <KpiTile label="Regressions" value={failCount.toString()} />
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Run history</h2>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pass rate</TableHead>
                <TableHead className="text-right">Grounding</TableHead>
                <TableHead className="text-right">p50 latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STUB_RUNS.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-sm">{run.timestamp}</TableCell>
                  <TableCell>
                    <EvalBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {Math.round(run.passRate * 100)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {Math.round(run.groundingScore * 100)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {run.p50LatencyMs}ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
