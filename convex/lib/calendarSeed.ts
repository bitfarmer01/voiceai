/**
 * Sample-calendar generation — pure and clock-free (callers pass the dates).
 * Every business gets the next CALENDAR_DAYS of 30-minute slots from its posted
 * hours, with ~SAMPLE_BOOKED_PCT% marked booked by a stable hash so the pattern
 * is identical on every reseed.
 */
import { slotsFor, type WeeklySchedule } from "./hours";

export const CALENDAR_DAYS = 14;
export const SAMPLE_BOOKED_PCT = 40;

/** Degrade-path grid when the hours can't be parsed — weekdays only. */
export const GENERIC_SLOTS = ["09:00", "11:30", "14:00", "16:30"];

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayYmd(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** FNV-1a 32-bit — stable across runtimes, no deps. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Every bookable "HH:mm" on `date` (30-min grid). Unknown hours → generic weekday grid. */
export function dayGrid(schedule: WeeklySchedule | null, date: string): string[] {
  if (schedule) return slotsFor(schedule, date, { stepMin: 30, max: 48 });
  const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return dow >= 1 && dow <= 5 ? [...GENERIC_SLOTS] : [];
}

/** The sample-booked slots for [fromDate, fromDate + days). Deterministic per business. */
export function sampleSlots(
  businessId: string,
  schedule: WeeklySchedule | null,
  fromDate: string,
  services: string[],
  days: number = CALENDAR_DAYS,
): { date: string; time: string; service?: string }[] {
  const out: { date: string; time: string; service?: string }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    for (const time of dayGrid(schedule, date)) {
      const h = hash32(`${businessId}|${date}|${time}`);
      if (h % 100 >= SAMPLE_BOOKED_PCT) continue;
      out.push(
        services.length > 0
          ? { date, time, service: services[(h >>> 8) % services.length] }
          : { date, time },
      );
    }
  }
  return out;
}
