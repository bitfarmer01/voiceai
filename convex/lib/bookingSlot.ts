/**
 * Slot parsing + hours validation for chat bookings. Mirrors the (frozen)
 * convex/tools.ts booking validation EXACTLY, extracted so the chat wrapper
 * (convex/chat.ts) can validate a slot itself and persist the booking onto its
 * own chat anchor — instead of routing through internal.tools.bookAppointment,
 * which prefers any live voice call and would mis-attach a chat booking.
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
 * Validate a requested slot against the business hours, mirroring the frozen
 * tool's booking validation. ok:false → reject (nothing should be persisted).
 * ok:true with degradeNote → book it but surface the note (degrade-open).
 */
export function validateSlot(
  hoursText: string,
  slot: string,
  nowMs: number,
): { ok: true; degradeNote?: string } | { ok: false; message: string } {
  const parsed = parseSlot(slot);
  if (!parsed) {
    return { ok: true, degradeNote: "We couldn't read the requested time, so this is held as-is — please confirm it." };
  }
  if (isPastSlot(parsed.date, parsed.time, nowMs)) {
    return { ok: false, message: "That time is in the past — please pick an upcoming date and time." };
  }
  const schedule = parseHours(hoursText);
  if (schedule) {
    const dow = new Date(`${parsed.date}T00:00:00.000Z`).getUTCDay();
    if (!isOpenOn(schedule, parsed.date)) {
      return { ok: false, message: `We're ${describeDay(schedule, dow)} that day, so we can't book then. Posted hours: ${hoursText}` };
    }
    if (parsed.time && !isWithinHours(schedule, parsed.date, parsed.time)) {
      return { ok: false, message: `${parsed.time} is outside our hours — we're ${describeDay(schedule, dow)} that day. Posted hours: ${hoursText}` };
    }
    return { ok: true };
  }
  return { ok: true, degradeNote: hoursText ? "We couldn't verify this against the posted hours — please confirm it." : "No posted hours on file — please confirm this time." };
}
