"use client";

import { useQuery } from "convex/react";
import { PhoneCall, CalendarCheck, ChatCircle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/states/empty-state";
import { matchQuery } from "@/components/states/async-section";
import { OwnerStatCard } from "@/components/owner/owner-stat-card";
import { RecentActivityList } from "@/components/owner/recent-activity-list";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Owner Overview — "What your receptionist handled."
 *
 * Plain-language scoreboard for a non-technical small-business owner. Every number
 * comes straight from a live Convex query (api.ownerStats.summary) — no mock,
 * demo, or sample figures. Behind-the-scenes detail (speed, cost, providers) lives
 * on the technical screens, never here.
 */
export default function OverviewPage() {
  const summary = useQuery(api.ownerStats.summary, {});

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-balance">What your receptionist handled</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          A plain-English look at the calls your AI receptionist took care of for you.
        </p>
      </div>

      {matchQuery(
        summary,
        {
          loading: <OverviewSkeleton />,
          empty: (
            <EmptyState
              icon={PhoneCall}
              title="No calls yet"
              description="Once your receptionist answers its first call, you'll see what it handled — calls answered, appointments booked, and messages taken — right here."
              action={{ label: "Try it", href: "/try" }}
            />
          ),
          data: (s) => (
            <div className="space-y-10">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <OwnerStatCard
                  icon={PhoneCall}
                  label="Calls answered"
                  value={s.callsAnswered}
                  hint="Calls your receptionist picked up and handled for you."
                  accent
                />
                <OwnerStatCard
                  icon={CalendarCheck}
                  label="Appointments booked"
                  value={s.appointmentsBooked}
                  hint="Callers who scheduled a visit during the call."
                />
                <OwnerStatCard
                  icon={ChatCircle}
                  label="Messages taken"
                  value={s.messagesLeft}
                  hint="Callers who got in touch but didn't book a time."
                />
              </div>

              {s.recentActivity.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold text-balance">Recent activity</h2>
                  <RecentActivityList items={s.recentActivity} />
                </section>
              )}
            </div>
          ),
        },
        { isEmpty: (s) => s.callsHandled === 0 },
      )}
    </div>
  );
}

/** Structural skeleton sized to the final Overview layout, to avoid shift. */
function OverviewSkeleton() {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border bg-card p-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="mb-3 h-6 w-36" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
