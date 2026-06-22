/**
 * Owner-facing "Overview" — what the receptionist has actually done, in plain
 * English, computed ONLY from real `calls` rows. No mock/demo/sample numbers.
 *
 * HONESTY CONTRACT (read before adding a KPI here):
 *   Every number below is derived from rows the system genuinely writes. When a
 *   metric the schema cannot honestly support is requested, it is OMITTED and the
 *   reason is documented — never approximated, never faked. With zero ended calls
 *   this query returns all-zero counts and an empty activity list (not a placeholder).
 *
 * What the real data DOES support (and why):
 *   - callsAnswered          → count of `calls` with status === "ended". An ended
 *                              row is a call the receptionist actually handled to
 *                              completion (recordEndOfCall finalizes it).
 *   - appointmentsBooked     → ended calls whose `structuredData.booking` carries a
 *                              non-empty `confirmationId`. This is the exact shape
 *                              `book_appointment` writes (convex/tools.ts) and that
 *                              lib/calls/booking.ts#bookingFromStructuredData reads.
 *                              Detection is inlined (pure, no node deps) so this V8
 *                              query stays self-contained.
 *   - messagesLeft           → ended calls that did NOT book but DID hold a real
 *                              conversation (outcome === "intent": the caller engaged,
 *                              left intent, but no appointment was captured). This is
 *                              the honest "someone reached out and we noted it" number.
 *   - callsHandled (total)   → same as callsAnswered; surfaced explicitly so the UI
 *                              never has to re-derive it.
 *   - recentActivity         → a small, cheap newest-first list of ended calls with
 *                              only owner-meaningful, non-PII fields.
 *
 * What is DELIBERATELY OMITTED (cannot be honestly derived today):
 *   - "messagesTaken"/"callbacks" as a category SEPARATE from appointments:
 *       the ONLY writer of the `leads` table is `book_appointment`, which ALWAYS
 *       also writes a booking. So every lead IS a booking — there is no distinct
 *       non-booking lead/callback capture path in the code. Counting leads would
 *       double-count appointments, and a "leads minus bookings" count is always 0.
 *       `messagesLeft` above (engaged-but-not-booked calls) is the honest stand-in.
 *   - "after-hours calls": there is no business-hours/timezone model on a call row
 *       (businesses.profile.hours is free text, not parseable), so we cannot reliably
 *       decide whether a given startedAt was inside or outside opening hours.
 *   - "missed calls" / "calls not answered": the system only ever records calls it
 *       handled; there is no row representing a call that rang and went unanswered,
 *       so a missed-call count would be fabricated.
 *   - revenue / value of bookings: no price/value field exists on bookings or calls.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * True iff this call carries a real captured appointment. Mirrors
 * lib/calls/booking.ts#bookingFromStructuredData (the one field we must have is a
 * non-empty `confirmationId`) and the shape book_appointment writes. Inlined so the
 * V8 query has no cross-module/path-alias dependency.
 */
function hasBooking(structuredData: unknown): boolean {
  if (!structuredData || typeof structuredData !== "object") return false;
  const booking = (structuredData as Record<string, unknown>).booking;
  if (!booking || typeof booking !== "object") return false;
  const confirmationId = (booking as Record<string, unknown>).confirmationId;
  return typeof confirmationId === "string" && confirmationId !== "";
}

/** One owner-readable activity line — non-PII (no caller name/contact). */
const activityItem = v.object({
  id: v.id("calls"),
  businessName: v.string(),
  startedAt: v.number(),
  durationSec: v.number(),
  /** Plain-English result of the call, owner-facing. */
  result: v.union(
    v.literal("booked"),
    v.literal("messageLeft"),
    v.literal("noMessage"),
  ),
});

// ── summary ──────────────────────────────────────────────────────────────────
// Powers the owner Overview. Single indexed read on ended calls; all KPIs derived
// from that one set. Returns honest zeros/empty when nothing has happened yet.
export const summary = query({
  args: {
    /** How many recent calls to include in the activity list. Default 5, max 20. */
    recentLimit: v.optional(v.number()),
  },
  returns: v.object({
    callsAnswered: v.number(),
    appointmentsBooked: v.number(),
    messagesLeft: v.number(),
    callsHandled: v.number(),
    recentActivity: v.array(activityItem),
  }),
  handler: async (ctx, args) => {
    const recentLimit = Math.max(1, Math.min(args.recentLimit ?? 5, 20));

    // Indexed read: only calls the receptionist actually handled to completion.
    // (by_status, equality on "ended" — no `.filter()` for the WHERE clause.)
    const ended: Doc<"calls">[] = (
      await ctx.db
        .query("calls")
        .withIndex("by_status", (q) => q.eq("status", "ended"))
        .collect()
    ).filter((c) => c.channel !== "chat");

    let appointmentsBooked = 0;
    let messagesLeft = 0;

    for (const c of ended) {
      if (hasBooking(c.structuredData)) {
        appointmentsBooked += 1;
      } else if (c.outcome === "intent") {
        // Engaged caller, no appointment captured → an honest "message left".
        messagesLeft += 1;
      }
    }

    // Newest-first activity slice. Sort the already-collected set (no extra read);
    // ended-call volume in this app is small (single-tenant demo scale).
    const recentActivity = [...ended]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, recentLimit)
      .map((c) => ({
        id: c._id,
        businessName: c.businessName,
        startedAt: c.startedAt,
        durationSec: c.durationSec,
        result: hasBooking(c.structuredData)
          ? ("booked" as const)
          : c.outcome === "intent"
            ? ("messageLeft" as const)
            : ("noMessage" as const),
      }));

    return {
      callsAnswered: ended.length,
      appointmentsBooked,
      messagesLeft,
      callsHandled: ended.length,
      recentActivity,
    };
  },
});
