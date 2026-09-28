/**
 * Pure view helpers for <AvailabilityCalendar>. Relative imports: tested file.
 */
import type { CalendarWindow } from "../convex/_contracts";

export type CalendarDay = CalendarWindow["days"][number];
export type CellState = "open" | "booked" | "mine" | "offered" | "none";

/** Sorted union of every slot time across the given days — the rows of the week grid. */
export function weekRows(days: CalendarDay[]): string[] {
  return [...new Set(days.flatMap((d) => d.slots.map((s) => s.time)))].sort();
}

export function cellState(day: CalendarDay, time: string, offered: Set<string>): CellState {
  const slot = day.slots.find((s) => s.time === time);
  if (!slot) return "none";
  if (slot.status === "mine") return "mine";
  if (slot.status === "booked") return "booked";
  return offered.has(`${day.date} ${time}`) ? "offered" : "open";
}

/** Normalize offered slot strings ("YYYY-MM-DD HH:mm" or ISO "T") to calendar keys. */
export function normalizeOffered(slots: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of slots) {
    const m = s.match(/(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
    if (m) out.add(`${m[1]} ${m[2].padStart(2, "0")}:${m[3]}`);
  }
  return out;
}

export function dayLabel(date: string): { weekday: string; dayNum: string } {
  const d = new Date(`${date}T00:00:00.000Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    dayNum: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

const STATE_WORD: Record<Exclude<CellState, "none">, string> = {
  open: "open",
  booked: "booked",
  mine: "your appointment",
  offered: "offered to you",
};

export function slotAriaLabel(date: string, time: string, state: CellState, detail?: string): string {
  const { weekday, dayNum } = dayLabel(date);
  const word = state === "none" ? "unavailable" : STATE_WORD[state];
  return `${weekday} ${dayNum}, ${time}, ${word}${detail ? ` (${detail})` : ""}`;
}
