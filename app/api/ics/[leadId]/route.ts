import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function formatIcsDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
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
  const { leadId } = await params;
  const lead = await convex.query(api.leads.getById, {
    leadId: leadId as Id<"leads">,
  });

  if (!lead) {
    return new NextResponse("Not found", { status: 404 });
  }

  const now = Date.now();
  // Use the booked slot when available; fall back to 1h after lead creation.
  const startMs = lead.slot
    ? new Date(lead.slot.includes("T") ? lead.slot : lead.slot.replace(" ", "T") + ":00Z").getTime()
    : lead.createdAt + 60 * 60 * 1000;
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
}
