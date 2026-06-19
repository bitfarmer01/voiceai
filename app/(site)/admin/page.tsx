"use client";

import { Lock } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { formatUsd, formatDuration } from "@/lib/format";
import { BudgetMeter } from "@/components/shared/budget-meter";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { matchQuery } from "@/components/states/async-section";
import { CALL_OUTCOME } from "@/lib/calls/outcome";
import { useBudgetState } from "@/lib/data";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_ENABLED === "true";

export default function AdminPage() {
  if (!ENABLED) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <EmptyState
          icon={Lock}
          title="Admin access restricted"
          description="Set NEXT_PUBLIC_ADMIN_ENABLED=true in your environment to enable this page."
        />
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
        {matchQuery(calls, {
          loading: (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ),
          empty: (
            <EmptyState
              title="No calls recorded"
              description="Call data appears here once the demo has been used."
              action={{ label: "Make a call", href: "/try" }}
            />
          ),
          data: (rows) => (
            <div className="space-y-2">
              {rows.map((c) => {
                const o = CALL_OUTCOME[c.outcome];
                const OutcomeIcon = o.icon;
                return (
                  <Link
                    key={c.id}
                    href={`/calls/${c.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 text-sm hover:border-primary/40"
                  >
                    <OutcomeIcon
                      className={`size-4 shrink-0 ${o.iconClass}`}
                      aria-label={o.headline}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.businessName}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {c.sttProvider} · {c.ttsProvider}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">{formatDuration(c.durationSec)}</span>
                    <span className="shrink-0 font-mono text-xs font-medium tabular-nums">{formatUsd(c.costUsd, 3)}</span>
                  </Link>
                );
              })}
            </div>
          ),
        })}
      </section>
    </div>
  );
}
