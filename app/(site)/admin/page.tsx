"use client";

import { Lock } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { formatUsd, formatDuration } from "@/lib/format";
import { BudgetMeter } from "@/components/shared/budget-meter";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgetState } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { CallOutcome } from "@/lib/types";

const OUTCOME_DOT: Record<CallOutcome, string> = {
  booked: "bg-success",
  intent: "bg-info",
  abandoned: "bg-warning",
};

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_ENABLED === "true";

export default function AdminPage() {
  if (!ENABLED) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">Admin access restricted</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Set <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_ADMIN_ENABLED=true</code> in your environment to enable this page.
        </p>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const budget = useBudgetState();
  const calls = useQuery(api.calls.listRecent, { limit: 100 });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Spend dashboard · private</p>
      </div>

      <section className="mb-8 rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Budget status</h2>
        <BudgetMeter budget={budget} />
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Call log (last 100)</h2>
        {calls === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <EmptyState
            title="No calls recorded"
            description="Call data appears here once the demo has been used."
            action={{ label: "Make a call", href: "/try" }}
          />
        ) : (
          <div className="space-y-2">
            {calls.map((c) => (
              <Link
                key={c.id}
                href={`/calls/${c.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm hover:border-primary/40"
              >
                <span className={cn("size-2 shrink-0 rounded-full", OUTCOME_DOT[c.outcome])} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.businessName}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {c.sttProvider} · {c.ttsProvider}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums">{formatDuration(c.durationSec)}</span>
                <span className="shrink-0 font-mono text-xs font-medium tabular-nums">{formatUsd(c.costUsd, 3)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
