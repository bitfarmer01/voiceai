/**
 * Slot parsing + hours validation. The single source of slot validation for
 * both convex/tools.ts (voice) and convex/chat.ts (text), so a slot is judged
 * the same way regardless of channel. The chat wrapper validates a slot itself
 * and persists the booking onto its own chat anchor — instead of routing
 * through internal.tools.bookAppointment, which prefers any live voice call
 * and would mis-attach a chat booking.
 * Schedule rules come from ./hours (shared, not duplicated); only the slot-string
 * parsing is reproduced here.
 */
import {
  parseHours,
  isOpenOn,
  isWithinHours,
  describeDay,
  parseTimeToken,
  toHHMM,
} from "./hours";

function isValidYmd(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return !Number.isNaN(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

export function parseSlot(slot: string): { date: string; time?: string } | null {
  if (typeof slot !== "string") return null;
  const trimmed = slot.trim();
  const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const date = dateMatch[1];
  if (!isValidYmd(date)) return null;
  const rest = trimmed.slice(trimmed.indexOf(date) + date.length);
  const timeMatch = rest.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})/i);
  if (!timeMatch) return { date };
  const mins = parseTimeToken(timeMatch[1].replace(/\s+/g, ""));
  if (mins === null) return { date };
  return { date, time: toHHMM(mins) };
}

export function isPastSlot(date: string, time: string | undefined, nowMs: number): boolean {
  const dayMs = new Date(`${date}T00:00:00.000Z`).getTime();
  if (time === undefined) {
    const n = new Date(nowMs);
    const todayMs = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    return dayMs < todayMs;
  }
  const minutes = parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10);
  return dayMs + minutes * 60_000 < nowMs;
}

/**
 * Validate a requested slot against the business hours. A concrete time is
 * REQUIRED (the receptionist offers exact calendar slots), so an unreadable or
 * date-only slot is rejected. ok:true returns the parsed date/time so callers can
 * claim the calendar slot; degradeNote is set when the hours couldn't be parsed.
 */
export function validateSlot(
  hoursText: string,
  slot: string,
  nowMs: number,
): { ok: true; date: string; time: string; degradeNote?: string } | { ok: false; message: string } {
  const parsed = parseSlot(slot);
  if (!parsed || !parsed.time) {
    return { ok: false, message: "Please pick one of the specific times I offered — a day and a time." };
  }
  const { date, time } = parsed;
  if (isPastSlot(date, time, nowMs)) {
    return { ok: false, message: "That time is in the past — please pick an upcoming date and time." };
  }
  const schedule = parseHours(hoursText);
  if (schedule) {
    const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (!isOpenOn(schedule, date)) {
      return { ok: false, message: `We're ${describeDay(schedule, dow)} that day, so we can't book then. Posted hours: ${hoursText}` };
    }
    if (!isWithinHours(schedule, date, time)) {
      return { ok: false, message: `${time} is outside our hours — we're ${describeDay(schedule, dow)} that day. Posted hours: ${hoursText}` };
    }
    return { ok: true, date, time };
  }
  return {
    ok: true,
    date,
    time,
    degradeNote: hoursText
      ? "We couldn't verify this against the posted hours — please confirm it."
      : "No posted hours on file — please confirm this time.",
  };
}
