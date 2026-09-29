/**
 * Open-slot search over a day grid minus taken slots. Pure; the Convex layer
 * supplies the grid (from the parsed hours) and the taken set (from appointments).
 */
import { isPastSlot } from "./bookingSlot";
import { parseTimeToken } from "./hours";
import { addDays, CALENDAR_DAYS } from "./calendarSeed";

export type TimeWindow = { startMin: number; endMin: number };

/** "morning" | "afternoon" | "evening" | a clock time → a minutes window; else null. */
export function preferredWindow(pref: string | undefined): TimeWindow | null {
  if (!pref) return null;
  const p = pref.trim().toLowerCase();
  if (p.includes("morning")) return { startMin: 0, endMin: 12 * 60 };
  if (p.includes("afternoon")) return { startMin: 12 * 60, endMin: 17 * 60 };
  if (p.includes("evening")) return { startMin: 17 * 60, endMin: 24 * 60 };
  const mins = parseTimeToken(p.replace(/\s+/g, ""));
  return mins === null ? null : { startMin: mins, endMin: 24 * 60 };
}

function toMin(time: string): number {
  return parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10);
}

/**
 * The `count` soonest open "YYYY-MM-DD HH:mm" slots from `fromDate` forward within
 * `horizonDays`, skipping taken and past slots. A preferred window is honored when
 * anything in the horizon fits it; otherwise the window is dropped.
 */
export function nextOpenSlots(args: {
  grid: (date: string) => string[];
  taken: Set<string>;
  fromDate: string;
  preferredTime?: string;
  nowMs: number;
  count?: number;
  horizonDays?: number;
}): string[] {
  const count = args.count ?? 2;
  const horizon = args.horizonDays ?? CALENDAR_DAYS;
  const win = preferredWindow(args.preferredTime);

  const collect = (useWindow: boolean): string[] => {
    const out: string[] = [];
    for (let i = 0; i < horizon && out.length < count; i++) {
      const date = addDays(args.fromDate, i);
      for (const time of args.grid(date)) {
        if (out.length >= count) break;
        const key = `${date} ${time}`;
        if (args.taken.has(key) || isPastSlot(date, time, args.nowMs)) continue;
        if (useWindow && win) {
          const m = toMin(time);
          if (m < win.startMin || m >= win.endMin) continue;
        }
        out.push(key);
      }
    }
    return out;
  };

  const inWindow = collect(true);
  return inWindow.length > 0 || !win ? inWindow : collect(false);
}
