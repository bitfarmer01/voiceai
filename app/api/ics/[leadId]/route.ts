import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function formatIcsDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * NaN-safe slot → epoch-ms parse. Mirrors lib/calls/booking.formatSlot's tolerant
 * shapes (we can't import it here): "HH:mm" wall-clock, "YYYY-MM-DD[ T]HH:mm[:ss][Z]"
 * datetimes, bare "YYYY-MM-DD" dates, and anything `new Date` natively understands.
 * Returns NaN for unparseable input so the caller can fall back — never throws.
 */
function slotToStartMs(slot: string, createdAt: number): number {
  const s = slot.trim();

  // Bare "HH:mm" — no date component. Anchor it to the lead's creation day (UTC)
  // so a wall-clock-only slot produces a valid, stable datetime.
  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (timeOnly) {
    const h = Number(timeOnly[1]);
    const mi = Number(timeOnly[2]);
    if (h > 23 || mi > 59) return NaN;
    const day = new Date(createdAt).toISOString().slice(0, 10); // YYYY-MM-DD
    return new Date(`${day}T${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}:00Z`).getTime();
  }

  // "YYYY-MM-DD HH:mm" (space-separated, no zone) → treat as UTC.
  const dateTimeSpace = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})(:\d{2})?$/.exec(s);
  if (dateTimeSpace) {
    const [, y, mo, d, h, mi, sec] = dateTimeSpace;
    return new Date(
      `${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi}:${(sec ?? ":00").slice(1)}Z`,
    ).getTime();
  }

  // Bare "YYYY-MM-DD" → midnight UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) return new Date(`${s}T00:00:00Z`).getTime();

  // Anything else (ISO with T/zone, etc.) — let Date try; getTime() is NaN if invalid.
  return new Date(s).getTime();
}

// RFC 5545 §3.3.11 TEXT escaping: \, comma, semicolon must be escaped.
// Newlines become literal \n; bare CRs are stripped to prevent property injection.
function escapeIcsText(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

// Strip control characters (including CR/LF) from single-line ICS property values
// to prevent header injection via user-supplied strings.
function sanitizeIcsLine(s: string): string {
  return s.replace(/[\r\n]/g, " ").trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  // Any thrown error here (a malformed leadId rejected by v.id("leads") in the
  // query, an unparseable slot, etc.) must surface as a 404 — never an unhandled
  // 500 on the AppointmentCard "Add to calendar" link.
  try {
    const { leadId } = await params;
    const lead = await convex.query(api.leads.getById, {
      leadId: leadId as Id<"leads">,
    });

    if (!lead) {
      return new NextResponse("Not found", { status: 404 });
    }

    const now = Date.now();
    const fallbackMs = lead.createdAt + 60 * 60 * 1000;
    // Use the booked slot when parseable; otherwise fall back to 1h after lead
    // creation. A slot like "14:00" or natural language would yield NaN, which
    // would crash formatIcsDate(new Date(NaN).toISOString()) — guard against it.
    let startMs = lead.slot ? slotToStartMs(lead.slot, lead.createdAt) : fallbackMs;
    if (Number.isNaN(startMs)) startMs = fallbackMs;
    const endMs = startMs + 60 * 60 * 1000;

    const ics =
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Receptionist AI//EN",
        "BEGIN:VEVENT",
        `UID:${leadId}@receptionist.ai`,
        `DTSTAMP:${formatIcsDate(now)}`,
        `DTSTART:${formatIcsDate(startMs)}`,
        `DTEND:${formatIcsDate(endMs)}`,
        `SUMMARY:Appointment at ${sanitizeIcsLine(lead.businessName)}`,
        `DESCRIPTION:${escapeIcsText(lead.request)}`,
        `CONTACT:${sanitizeIcsLine(lead.contact)}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n") + "\r\n";

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="appointment.ics"`,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
