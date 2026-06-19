/**
 * Pure helpers for the structured booking that `book_appointment` writes onto a
 * call's `structuredData`. Kept side-effect-free so both the live `/try` page and
 * the post-call report render bookings the same way (and so it's unit-testable).
 */
import type { Booking } from "@/lib/types";
// Relative (not "@/lib/unknown"): this module is exercised by Vitest, whose
// resolver doesn't apply the "@/" tsconfig path alias to runtime value imports.
import { asNumber, asString, prop } from "../unknown";

/**
 * Extract a typed `Booking` from a call's `structuredData` (loosely `v.any()` on
 * the backend). Returns null unless there's a `booking` object carrying a
 * non-empty `confirmationId` — the one field we must have to link the .ics.
 */
export function bookingFromStructuredData(structuredData: unknown): Booking | null {
  const raw = prop(structuredData, "booking");
  if (!raw || typeof raw !== "object") return null;

  const confirmationId = prop(raw, "confirmationId");
  if (typeof confirmationId !== "string" || confirmationId === "") return null;

  return {
    confirmationId,
    slot: asString(prop(raw, "slot")) ?? "",
    customerName: asString(prop(raw, "customerName")) ?? "",
    contact: asString(prop(raw, "contact")) ?? "",
    service: asString(prop(raw, "service")) ?? null,
    notes: asString(prop(raw, "notes")) ?? null,
    bookedAt: asNumber(prop(raw, "bookedAt")) ?? 0,
  };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "14:00" → "2:00 PM". Pure (no Date/locale) so it's timezone-stable. */
function to12h(h: number, m: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * Format a booked slot for display. Handles the shapes the contract allows —
 * "HH:mm" wall-clock, "YYYY-MM-DD[ T]HH:mm[:ss][Z]" datetimes, and bare dates —
 * by string-parsing (not `new Date`) so output never drifts with the viewer's
 * timezone. Unrecognized strings pass through untouched.
 */
export function formatSlot(slot: string): string {
  const s = slot.trim();

  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (timeOnly) return to12h(Number(timeOnly[1]), Number(timeOnly[2]));

  const dateTime = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (dateTime) {
    const [, y, mo, d, h, mi] = dateTime;
    const month = MONTHS[Number(mo) - 1] ?? mo;
    return `${month} ${Number(d)}, ${y} · ${to12h(Number(h), Number(mi))}`;
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return `${MONTHS[Number(mo) - 1] ?? mo} ${Number(d)}, ${y}`;
  }

  return s;
}
