"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CallTimeline } from "@/components/shared/call-timeline";
import { EmptyState } from "@/components/states/empty-state";
import { formatDuration, formatUsd, formatMs } from "@/lib/format";
import type { TranscriptTurn } from "@/lib/types";

/** Analytics the report shows — a subset of the api.calls.getById projection. */
type CallReport = { durationSec: number; costUsd: number; ttfwMs?: number } | null | undefined;

/**
 * PostCallReport — the inline "call ended" surface for /app/[slug]. Shows the full
 * transcript (from the client-buffered turns) plus a compact analytics strip
 * (duration, cost, time-to-first-word). Analytics come from the call record, filled by
 * the VAPI end-of-call webhook; on local/dev (no public webhook) they read as zeros
 * until the webhook lands. One primary action: call again.
 */
export function PostCallReport({
  businessName,
  turns,
  report,
  onCallAgain,
}: {
  businessName: string;
  turns: TranscriptTurn[];
  report: CallReport;
  onCallAgain: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center gap-3">
        <CheckCircle weight="fill" className="size-7 text-success" aria-hidden />
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            Call ended
          </p>
          <h1 className="text-lg font-semibold tracking-tight text-balance">{businessName}</h1>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="Duration" value={formatDuration(report?.durationSec ?? 0)} />
        <Stat label="Cost" value={formatUsd(report?.costUsd ?? 0)} />
        <Stat label="First word" value={formatMs(report?.ttfwMs ?? 0)} />
      </dl>

      <div className="mt-6 rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transcript
        </h2>
        {turns.length === 0 ? (
          <EmptyState title="No transcript captured" />
        ) : (
          <CallTimeline turns={turns} autoScroll={false} className="max-h-[420px]" />
        )}
      </div>

      <Button className="mt-6 w-full" onClick={onCallAgain}>
        Call again
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}
