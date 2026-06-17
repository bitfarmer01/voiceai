"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Clock, Phone } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatUsd, formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { CallOutcome } from "@/lib/types";

const OUTCOME_DOT: Record<CallOutcome, string> = {
  booked: "bg-success",
  intent: "bg-info",
  abandoned: "bg-warning",
};
const OUTCOME_LABEL: Record<CallOutcome, string> = {
  booked: "Booked",
  intent: "Intent captured",
  abandoned: "Abandoned",
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CallsPage() {
  const calls = useQuery(api.calls.listRecentAnonymized, { limit: 50 });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recent Calls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live anonymized feed — no PII stored
          </p>
        </div>
        <Link
          href="/try"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Phone className="size-4" />
          Start a call
        </Link>
      </div>

      {calls === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <EmptyState
          title="No calls yet"
          description="Be the first to try the receptionist. Anonymized call summaries appear here in realtime."
        />
      ) : (
        <div className="space-y-3">
          {calls.map((c) => (
            <Link
              key={c.id}
              href={`/calls/${c.id}`}
              className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", OUTCOME_DOT[c.outcome])} />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{c.businessName}</span>
                  <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {OUTCOME_LABEL[c.outcome]}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-muted-foreground">
                  <span>{c.sttProvider}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{c.ttsProvider}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{c.llmProvider}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-sm tabular-nums">{formatUsd(c.costUsd, 3)}</p>
                <div className="mt-1 flex items-center justify-end gap-1.5 font-mono text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  <span>{formatDuration(c.durationSec)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{timeAgo(c.startedAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
