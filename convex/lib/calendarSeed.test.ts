import { describe, expect, it } from "vitest";
import { parseHours } from "./hours";
import { addDays, dayGrid, GENERIC_SLOTS, hash32, sampleSlots, todayYmd } from "./calendarSeed";

const GLOW = parseHours("Mon–Fri 8:00–17:00, Sat 9:00–13:00");
const FROM = "2026-06-20"; // Saturday

describe("date helpers", () => {
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-06-29", 3)).toBe("2026-07-02");
  });
  it("todayYmd is the UTC date", () => {
    expect(todayYmd(Date.parse("2026-06-20T23:59:00.000Z"))).toBe("2026-06-20");
  });
  it("hash32 is stable", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(hash32("abc")).not.toBe(hash32("abd"));
  });
});

describe("dayGrid", () => {
  it("returns every 30-min slot inside the open window", () => {
    const grid = dayGrid(GLOW, "2026-06-22"); // Monday 08:00–17:00
    expect(grid[0]).toBe("08:00");
    expect(grid[grid.length - 1]).toBe("16:30");
    expect(grid).toHaveLength(18);
  });
  it("is empty on a closed day", () => {
    expect(dayGrid(GLOW, "2026-06-21")).toEqual([]); // Sunday
  });
  it("falls back to the generic weekday grid when hours are unknown", () => {
    expect(dayGrid(null, "2026-06-22")).toEqual(GENERIC_SLOTS);
    expect(dayGrid(null, "2026-06-20")).toEqual([]); // Saturday
  });
});

describe("sampleSlots", () => {
  const all = Array.from({ length: 14 }, (_, i) => dayGrid(GLOW, addDays(FROM, i))).flat().length;

  it("is deterministic per business", () => {
    expect(sampleSlots("biz_a", GLOW, FROM, ["Cleaning"])).toEqual(sampleSlots("biz_a", GLOW, FROM, ["Cleaning"]));
    expect(sampleSlots("biz_a", GLOW, FROM, [])).not.toEqual(sampleSlots("biz_b", GLOW, FROM, []));
  });

  it("books roughly 40% of the 14-day grid", () => {
    const n = sampleSlots("biz_a", GLOW, FROM, []).length;
    expect(n / all).toBeGreaterThan(0.3);
    expect(n / all).toBeLessThan(0.5);
  });

  it("only uses grid slots and assigns a known service", () => {
    for (const s of sampleSlots("biz_a", GLOW, FROM, ["Cleaning", "Whitening"])) {
      expect(dayGrid(GLOW, s.date)).toContain(s.time);
      expect(["Cleaning", "Whitening"]).toContain(s.service);
    }
  });
});
