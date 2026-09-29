import { describe, expect, it } from "vitest";
import { cellState, dayLabel, normalizeOffered, slotAriaLabel, weekRows, type CalendarDay } from "./calendar-view";

const mon: CalendarDay = {
  date: "2026-06-22",
  open: true,
  slots: [
    { time: "09:00", status: "open" },
    { time: "09:30", status: "booked", service: "Cleaning" },
    { time: "10:00", status: "mine", service: "Cleaning", firstName: "Sam" },
  ],
};
const sat: CalendarDay = { date: "2026-06-27", open: true, slots: [{ time: "08:30", status: "open" }] };
const sun: CalendarDay = { date: "2026-06-28", open: false, slots: [] };

describe("calendar-view", () => {
  it("weekRows is the sorted union of slot times", () => {
    expect(weekRows([mon, sat, sun])).toEqual(["08:30", "09:00", "09:30", "10:00"]);
  });

  it("cellState maps statuses and rings offered open slots", () => {
    const offered = normalizeOffered(["2026-06-22 09:00"]);
    expect(cellState(mon, "09:00", offered)).toBe("offered");
    expect(cellState(mon, "09:30", offered)).toBe("booked");
    expect(cellState(mon, "10:00", offered)).toBe("mine");
    expect(cellState(mon, "08:30", offered)).toBe("none");
    expect(cellState(sat, "08:30", offered)).toBe("open");
  });

  it("normalizeOffered accepts ISO 'T' and space forms and ignores junk", () => {
    expect([...normalizeOffered(["2026-06-22T09:00", "2026-06-22 9:30", "nope"])]).toEqual([
      "2026-06-22 09:00",
      "2026-06-22 09:30",
    ]);
  });

  it("dayLabel is UTC-stable", () => {
    expect(dayLabel("2026-06-22")).toEqual({ weekday: "Mon", dayNum: "Jun 22" });
  });

  it("slotAriaLabel reads naturally", () => {
    expect(slotAriaLabel("2026-06-22", "09:30", "booked", "Cleaning")).toBe("Mon Jun 22, 09:30, booked (Cleaning)");
    expect(slotAriaLabel("2026-06-22", "09:00", "open")).toBe("Mon Jun 22, 09:00, open");
  });
});
