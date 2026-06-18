"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  CalendarCheck,
  ChatCircle,
  Question,
  CaretRight,
  Phone,
} from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { CallOutcome } from "@/lib/types";

// Plain-language framing of each call's outcome — what actually happened, in
// words a shop owner would use. No jargon, no provider names, no cost numbers.
const OUTCOME: Record<
  CallOutcome,
  { icon: React.ElementType; iconClass: string; headline: string; summary: string }
> = {
  booked: {
    icon: CalendarCheck,
    iconClass: "text-success",
    headline: "Booked an appointment",
    summary: "The caller scheduled a visit.",
  },
  intent: {
    icon: ChatCircle,
    iconClass: "text-primary",
    headline: "Took a message",
    summary: "The caller wanted to get in touch — details were captured.",
  },
  abandoned: {
    icon: Question,
    iconClass: "text-muted-foreground",
    headline: "Answered a question",
    summary: "The caller asked about the business and hung up.",
  },
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
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

      {calls === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <EmptyState
          title="No calls yet"
          description="Once the receptionist answers a call, a plain summary of what happened shows up here."
          action={{ label: "Try it", href: "/try" }}
        />
      ) : (
        <div className="space-y-3">
          {calls.map((c) => {
            const o = OUTCOME[c.outcome];
            const Icon = o.icon;
            return (
              <Link
                key={c.id}
                href={`/calls/${c.id}`}
                className="group flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-primary/40"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted">
                  <Icon className={`size-4 ${o.iconClass}`} aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-balance">
                    {o.headline}
                    <span className="text-muted-foreground"> · {c.businessName}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{o.summary}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs tabular-nums text-muted-foreground">{timeAgo(c.startedAt)}</p>
                  <CaretRight className="ml-auto mt-1 size-4 text-muted-foreground/50 group-hover:text-foreground" aria-hidden />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
