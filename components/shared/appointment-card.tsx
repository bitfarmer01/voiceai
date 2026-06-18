import * as React from "react";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSlot } from "@/lib/calls/booking";
import type { Booking } from "@/lib/types";

/**
 * AppointmentCard — renders a structured booking captured by `book_appointment`:
 * what/when/who plus a one-click .ics download. Chrome-less (no outer border or
 * background) so each caller supplies its own section: it's shown inline on the
 * live /try page the moment the booking lands (Convex reactivity), and again on
 * the post-call report.
 */
export function AppointmentCard({
  booking,
  className,
}: {
  booking: Booking;
  className?: string;
}) {
  const rows: { label: string; value: string }[] = [
    ...(booking.service ? [{ label: "Service", value: booking.service }] : []),
    { label: "When", value: formatSlot(booking.slot) },
    ...(booking.customerName ? [{ label: "Name", value: booking.customerName }] : []),
    ...(booking.contact ? [{ label: "Contact", value: booking.contact }] : []),
    ...(booking.notes ? [{ label: "Notes", value: booking.notes }] : []),
  ];

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2">
        <CalendarCheck className="size-4 text-success" />
        <h3 className="text-sm font-semibold text-balance">Appointment booked</h3>
      </div>

      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-3 text-sm">
            <dt className="w-16 shrink-0 text-xs text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 flex-1 text-pretty text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>

      <Button asChild variant="outline" size="sm" className="mt-4 gap-1.5">
        <a href={`/api/ics/${booking.confirmationId}`} download="appointment.ics">
          <CalendarPlus className="size-3.5" />
          Add to calendar
        </a>
      </Button>
    </div>
  );
}
