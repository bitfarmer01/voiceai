import { describe, expect, it } from "vitest";
import { parseHours } from "./hours";
import { dayGrid } from "./calendarSeed";
import { nextOpenSlots, preferredWindow } from "./availability";

const GLOW = parseHours("Mon–Fri 8:00–17:00, Sat 9:00–13:00");
const grid = (d: string) => dayGrid(GLOW, d);
const NOW = Date.parse("2026-06-20T12:00:00.000Z");

describe("preferredWindow", () => {
  it("maps parts of day and clock times", () => {
    expect(preferredWindow("Morning")).toEqual({ startMin: 0, endMin: 720 });
    expect(preferredWindow("afternoon")).toEqual({ startMin: 720, endMin: 1020 });
    expect(preferredWindow("14:00")).toEqual({ startMin: 840, endMin: 1440 });
    expect(preferredWindow("2pm")).toEqual({ startMin: 840, endMin: 1440 });
    expect(preferredWindow(undefined)).toBeNull();
    expect(preferredWindow("whenever")).toBeNull();
  });
});

describe("nextOpenSlots", () => {
  it("returns the two soonest open slots as full keys", () => {
    expect(nextOpenSlots({ grid, taken: new Set(), fromDate: "2026-06-22", nowMs: NOW })).toEqual([
      "2026-06-22 08:00",
      "2026-06-22 08:30",
    ]);
  });

  it("skips taken slots", () => {
    const taken = new Set(["2026-06-22 08:00"]);
    expect(nextOpenSlots({ grid, taken, fromDate: "2026-06-22", nowMs: NOW })).toEqual([
      "2026-06-22 08:30",
      "2026-06-22 09:00",
    ]);
  });

  it("honors a part-of-day window", () => {
    expect(nextOpenSlots({ grid, taken: new Set(), fromDate: "2026-06-22", preferredTime: "afternoon", nowMs: NOW })).toEqual([
      "2026-06-22 12:00",
      "2026-06-22 12:30",
    ]);
  });

  it("rolls past a closed day to the next open day", () => {
    expect(nextOpenSlots({ grid, taken: new Set(), fromDate: "2026-06-21", nowMs: NOW })[0]).toBe("2026-06-22 08:00");
  });

  it("falls back outside the window when the window is full for the whole horizon", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.parse("2026-06-22T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
      for (const t of grid(d)) if (t < "12:00") taken.add(`${d} ${t}`);
    }
    const out = nextOpenSlots({ grid, taken, fromDate: "2026-06-22", preferredTime: "morning", nowMs: NOW });
    expect(out).toEqual(["2026-06-22 12:00", "2026-06-22 12:30"]);
  });

  it("excludes past times today", () => {
    const now = Date.parse("2026-06-22T10:10:00.000Z");
    expect(nextOpenSlots({ grid, taken: new Set(), fromDate: "2026-06-22", nowMs: now })[0]).toBe("2026-06-22 10:30");
  });

  it("returns [] when nothing is open within the horizon", () => {
    expect(nextOpenSlots({ grid: () => [], taken: new Set(), fromDate: "2026-06-22", nowMs: NOW })).toEqual([]);
  });
});
