"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/states/empty-state";
import {
  cellState,
  dayLabel,
  normalizeOffered,
  slotAriaLabel,
  weekRows,
  type CalendarDay,
  type CellState,
} from "@/lib/calendar-view";

// Signal Bold: tokens only; amber (primary) is reserved for the viewer's own booking.
const CELL: Record<Exclude<CellState, "none">, string> = {
  open: "border border-border bg-card text-muted-foreground",
  booked: "bg-muted text-muted-foreground",
  offered: "border border-foreground bg-card text-foreground ring-1 ring-foreground",
  mine: "bg-primary font-medium text-primary-foreground",
};

export interface AvailabilityCalendarProps {
  businessId: string;
  /** Slots the receptionist just offered ("YYYY-MM-DD HH:mm"); ringed. */
  offeredSlots?: string[];
  /** The viewer's own booking (lead id); shown in the accent with their first name. */
  highlightLeadId?: string;
  /** Owner view shows the service on booked slots. */
  ownerView?: boolean;
  title?: string;
  className?: string;
}

/**
 * AvailabilityCalendar — read-only, live view of the business's next 14 days:
 * open vs booked slots, the two slots just offered, and the viewer's own booking.
 * Week grid on md+, day tabs on mobile. Booking happens through the receptionist.
 */
export function AvailabilityCalendar({
  businessId,
  offeredSlots = [],
  highlightLeadId,
  ownerView = false,
  title = "Availability",
  className,
}: AvailabilityCalendarProps) {
  // Fixed per mount so the subscription args stay stable across renders.
  const [from] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [week, setWeek] = React.useState(0);
  const data = useQuery(api.calendar.getWindow, {
    businessId: businessId as Id<"businesses">,
    from,
    days: 14,
    highlightLeadId,
  });

  if (data === undefined) return <Skeleton className={cn("h-72 w-full rounded-2xl", className)} />;
  if (data === null) return null;

  const offered = normalizeOffered(offeredSlots);
  const days = data.days.slice(week * 7, week * 7 + 7);
  const rows = weekRows(days);
  const first = dayLabel(days[0]?.date ?? from);
  const last = dayLabel(days[days.length - 1]?.date ?? from);

  return (
    <section aria-label={title} className={cn("rounded-2xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-balance">{title}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {first.dayNum} – {last.dayNum}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" disabled={week === 0} onClick={() => setWeek(0)}>
            <CaretLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next week" disabled={week === 1} onClick={() => setWeek(1)}>
            <CaretRight className="size-4" />
          </Button>
        </div>
      </div>

      <Legend />

      {!data.hoursKnown && (
        <p className="mt-2 text-xs text-muted-foreground text-pretty">
          Showing example times — we couldn&apos;t read the posted hours.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No open hours this week" description="Try the other week." />
      ) : (
        <>
          {/* md+: week grid */}
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full border-separate border-spacing-1 text-xs tabular-nums">
              <thead>
                <tr>
                  <th scope="col" className="w-12">
                    <span className="sr-only">Time</span>
                  </th>
                  {days.map((d) => {
                    const l = dayLabel(d.date);
                    return (
                      <th key={d.date} scope="col" className="font-medium">
                        <span className="block">{l.weekday}</span>
                        <span className="block font-normal text-muted-foreground">{d.open ? l.dayNum : "Closed"}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((time) => (
                  <tr key={time}>
                    <th scope="row" className="pr-1 text-right font-mono font-normal text-muted-foreground">
                      {time}
                    </th>
                    {days.map((d) => (
                      <td key={d.date}>
                        <Cell day={d} time={time} offered={offered} ownerView={ownerView} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile: day tabs */}
          <Tabs key={week} defaultValue={days[0]?.date} className="mt-3 md:hidden">
            <TabsList className="w-full overflow-x-auto">
              {days.map((d) => (
                <TabsTrigger key={d.date} value={d.date} className="text-xs">
                  {dayLabel(d.date).weekday}
                </TabsTrigger>
              ))}
            </TabsList>
            {days.map((d) => (
              <TabsContent key={d.date} value={d.date}>
                {d.slots.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {d.open ? "Nothing left today" : "Closed"}
                  </p>
                ) : (
                  <ul className="grid grid-cols-3 gap-1.5 text-xs tabular-nums">
                    {d.slots.map((s) => (
                      <li key={s.time}>
                        <Cell day={d} time={s.time} offered={offered} ownerView={ownerView} showTime />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
    </section>
  );
}

function Cell({
  day,
  time,
  offered,
  ownerView,
  showTime = false,
}: {
  day: CalendarDay;
  time: string;
  offered: Set<string>;
  ownerView: boolean;
  showTime?: boolean;
}) {
  const state = cellState(day, time, offered);
  if (state === "none") {
    return <span aria-hidden className={cn("block h-7 rounded-md", !day.open && "bg-muted/40")} />;
  }
  const slot = day.slots.find((s) => s.time === time);
  const text =
    state === "mine"
      ? slot?.firstName ?? "Yours"
      : state === "booked"
        ? ownerView && slot?.service
          ? slot.service
          : "Booked"
        : state === "offered"
          ? "Offered"
          : "";
  const detail = state === "mine" || (state === "booked" && ownerView) ? slot?.service : undefined;
  return (
    <span className={cn("flex h-7 items-center justify-center truncate rounded-md px-1", CELL[state])}>
      <span aria-hidden className="truncate">
        {showTime ? `${time}${text ? ` · ${text}` : ""}` : text}
      </span>
      <span className="sr-only">{slotAriaLabel(day.date, time, state, detail)}</span>
    </span>
  );
}

function Legend() {
  const items: { label: string; state: Exclude<CellState, "none"> }[] = [
    { label: "Open", state: "open" },
    { label: "Booked", state: "booked" },
    { label: "Offered", state: "offered" },
    { label: "Yours", state: "mine" },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.state} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-sm", CELL[i.state])} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
