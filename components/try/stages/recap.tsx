"use client";

import Link from "next/link";
import { CheckCircle, ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/shared/appointment-card";
import type { Booking } from "@/lib/types";

/**
 * Recap — the calm "done" state shown when a call ends, shared by the demo and
 * your-business branches. Leads with one primary next action; the rest are quiet.
 */
export function Recap({
  variant,
  businessName,
  booking,
  messageCount,
  reportHref,
  onBuild,
  onCallAgain,
  onEdit,
}: {
  variant: "demo" | "your";
  businessName: string;
  booking: Booking | null;
  messageCount: number;
  reportHref?: string;
  /** demo only — advance to building the owner's receptionist. */
  onBuild?: () => void;
  onCallAgain: () => void;
  /** your only — go back to the form to change the business. */
  onEdit?: () => void;
}) {
  const isDemo = variant === "demo";
  const title = isDemo ? "That's a receptionist in action" : "That's your receptionist";
  const subtitle = isDemo
    ? `${businessName} just handled that call${booking ? " and booked an appointment" : ""}. Ready to hear it answer for your business?`
    : `It answered as ${businessName}${booking ? " and booked an appointment" : ""}.`;

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border bg-muted">
        <CheckCircle weight="fill" className="size-9 text-success" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-2 text-pretty text-muted-foreground">{subtitle}</p>

      <dl className="mt-6 w-full rounded-xl border bg-card px-5 py-4 text-left">
        <Row label="Messages exchanged" value={`${messageCount}`} />
        {booking && <Row label="Appointment" value="Booked" />}
      </dl>

      {booking && (
        <div className="mt-3 w-full rounded-xl border bg-card px-5 py-4 text-left">
          <AppointmentCard booking={booking} />
        </div>
      )}

      <div className="mt-7 flex w-full flex-col gap-2.5">
        {isDemo ? (
          <>
            <Button className="w-full gap-1.5" onClick={onBuild}>
              Build my receptionist
              <ArrowRight className="size-4" />
            </Button>
            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={onCallAgain}>
                Call the demo again
              </Button>
              {reportHref && (
                <Button asChild variant="outline" className="flex-1">
                  <Link href={reportHref}>View call summary</Link>
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {reportHref ? (
              <Button asChild className="w-full">
                <Link href={reportHref}>View the full call summary</Link>
              </Button>
            ) : (
              <Button className="w-full" onClick={onCallAgain}>
                Call again
              </Button>
            )}
            <div className="flex gap-2.5">
              {reportHref && (
                <Button variant="outline" className="flex-1" onClick={onCallAgain}>
                  Call again
                </Button>
              )}
              {onEdit && (
                <Button variant="outline" className="flex-1" onClick={onEdit}>
                  Edit my business
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
