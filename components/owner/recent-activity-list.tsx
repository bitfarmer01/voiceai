"use client";

import Link from "next/link";
import {
  CalendarCheck,
  ChatCircle,
  Phone,
  CaretRight,
  type Icon,
} from "@phosphor-icons/react";
import { formatDuration } from "@/lib/format";
import { useTimeAgo } from "@/lib/hooks/use-time-ago";

/** One row as the owner Overview cares about it (mirrors ownerStats.summary). */
export interface ActivityItem {
  id: string;
  businessName: string;
  startedAt: number;
  durationSec: number;
  result: "booked" | "messageLeft" | "noMessage";
}

/**
 * Plain-English framing of each result — owner words, no jargon.
 *
 * Intentionally NOT the shared `lib/calls/outcome` (CALL_OUTCOME) map: this keys on a
 * DIFFERENT enum (`result`: booked / messageLeft / noMessage) from a different source
 * (api.ownerStats.summary) at a coarser granularity — "noMessage" ("Answered a call")
 * is not the same as CallOutcome's "abandoned" ("Answered a question"). Forcing them
 * onto one map would change what the Overview communicates, so they diverge by design.
 */
const RESULT: Record<
  ActivityItem["result"],
  { icon: Icon; iconClass: string; label: string }
> = {
  booked: {
    icon: CalendarCheck,
    iconClass: "text-success",
    label: "Booked an appointment",
  },
  messageLeft: {
    icon: ChatCircle,
    iconClass: "text-primary",
    label: "Took a message",
  },
  noMessage: {
    icon: Phone,
    iconClass: "text-muted-foreground",
    label: "Answered a call",
  },
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const r = RESULT[item.result];
  const Icon = r.icon;
  const ago = useTimeAgo(item.startedAt);
  return (
    <Link
      href={`/calls/${item.id}`}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-primary/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted">
        <Icon className={`size-4 ${r.iconClass}`} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-balance">
          {r.label}
          <span className="text-muted-foreground"> · {item.businessName}</span>
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Lasted <span className="tabular-nums">{formatDuration(item.durationSec)}</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="min-h-4 text-xs tabular-nums text-muted-foreground">{ago}</p>
        <CaretRight
          className="ml-auto mt-1 size-4 text-muted-foreground/50 group-hover:text-foreground"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function RecentActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} />
      ))}
    </div>
  );
}
