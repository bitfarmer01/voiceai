"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CaretRight, Phone } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { matchQuery } from "@/components/states/async-section";
import { CALL_OUTCOME } from "@/lib/calls/outcome";
import { useTimeAgo } from "@/lib/hooks/use-time-ago";

type RecentCall = FunctionReturnType<typeof api.calls.listRecentAnonymized>[number];

function CallRow({ call }: { call: RecentCall }) {
  const o = CALL_OUTCOME[call.outcome];
  const Icon = o.icon;
  const ago = useTimeAgo(call.startedAt);
  return (
    <Link
      href={`/calls/${call.id}`}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-primary/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted">
        <Icon className={`size-4 ${o.iconClass}`} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-balance">
          {o.headline}
          <span className="text-muted-foreground"> · {call.businessName}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{o.summary}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="min-h-4 text-xs tabular-nums text-muted-foreground">{ago}</p>
        <CaretRight className="ml-auto mt-1 size-4 text-muted-foreground/50 group-hover:text-foreground" aria-hidden />
      </div>
    </Link>
  );
}

export default function CallsPage() {
  const calls = useQuery(api.calls.listRecentAnonymized, { limit: 50 });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-balance">Recent calls</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            What the receptionist handled, most recent first. Caller details are kept private.
          </p>
        </div>
        <Button asChild>
          <Link href="/try">
            <Phone className="size-4" />
            Try it
          </Link>
        </Button>
      </div>

      {matchQuery(calls, {
        loading: (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
            ))}
          </div>
        ),
        empty: (
          <EmptyState
            title="No calls yet"
            description="Once the receptionist answers a call, a plain summary of what happened shows up here."
            action={{ label: "Try it", href: "/try" }}
          />
        ),
        data: (rows) => (
          <div className="space-y-3">
            {rows.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </div>
        ),
      })}
    </div>
  );
}
