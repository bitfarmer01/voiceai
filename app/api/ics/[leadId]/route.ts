import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function formatIcsDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
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
  const startMs = lead.createdAt + 60 * 60 * 1000; // default: 1h after booking
  const endMs = startMs + 60 * 60 * 1000; // 1h duration

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Receptionist AI//EN",
    "BEGIN:VEVENT",
    `UID:${leadId}@receptionist.ai`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(startMs)}`,
    `DTEND:${formatIcsDate(endMs)}`,
    `SUMMARY:Appointment at ${lead.businessName}`,
    `DESCRIPTION:${lead.request.replace(/\n/g, "\\n")}`,
    `CONTACT:${lead.contact}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment.ics"`,
    },
  });
}
