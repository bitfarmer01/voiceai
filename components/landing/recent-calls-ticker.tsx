"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRecentCalls } from "@/lib/data";
import type { CallOutcome } from "@/lib/types";

const OUTCOME_DOT: Record<CallOutcome, string> = {
  booked: "bg-success",
  intent: "bg-info",
  abandoned: "bg-warning",
};
const OUTCOME_LABEL: Record<CallOutcome, string> = {
  booked: "Booked appointment",
  intent: "Captured intent",
  abandoned: "Abandoned",
};

function Pill({ id, outcome, business }: { id: string; outcome: CallOutcome; business: string }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 font-mono text-[11px]">
      <span className={cn("size-1.5 rounded-full", OUTCOME_DOT[outcome])} aria-hidden />
      <span className="text-muted-foreground">{id.replace("call_", "#")}</span>
      <span className="text-muted-foreground/50">·</span>
      <span className="text-muted-foreground">{business}</span>
      <span className="text-muted-foreground/40">→</span>
      <span className="text-foreground">{OUTCOME_LABEL[outcome]}</span>
    </div>
  );
}

/** Auto-scrolling anonymized proof-of-life ticker. Pauses on hover; empty-state aware. */
export function RecentCallsTicker() {
  const calls = useRecentCalls();

  if (calls.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-3 text-sm text-muted-foreground">
        <span>No calls yet today.</span>
        <Link href="/try" className="font-medium text-primary hover:underline">
          Be the first →
        </Link>
      </div>
    );
  }

  const loop = [...calls, ...calls];
  return (
    <div className="group relative overflow-hidden py-1">
      <div className="flex w-max gap-3 animate-ticker group-hover:[animation-play-state:paused]">
        {loop.map((c, i) => (
          <Pill key={`${c.id}-${i}`} id={c.id} outcome={c.outcome} business={c.businessName} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
