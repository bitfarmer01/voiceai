import { describe, it, expect } from "vitest";
import {
  parseHours,
  isOpenOn,
  isWithinHours,
  slotsFor,
  describeDay,
  type WeeklySchedule,
} from "./hours";

// Real preset hours strings. The CONTEXT gives the am/pm form; the live seed
// (convex/seed.ts) stores the 24h form. The parser MUST handle both, so we
// test each preset in BOTH notations.
const GLOW_AMPM = "Mon–Fri 8am–5pm, Sat 9am–1pm, closed Sunday";
const GLOW_24H = "Mon–Fri 8:00–17:00, Sat 9:00–13:00";
const LUX_AMPM = "Tue–Sat 10am–7pm, closed Sun & Mon";
const LUX_24H = "Tue–Sat 10:00–19:00";
const HALE = "Mon–Fri 9am–6pm by appointment";
const HALE_24H = "Mon–Fri 9:00–18:00";

// Helper: assert a day is closed (schedule entry is null).
function closed(s: WeeklySchedule, dow: number) {
  expect(s[dow]).toBeNull();
}
function open(s: WeeklySchedule, dow: number, openMin: number, closeMin: number) {
  expect(s[dow]).toEqual({ openMin, closeMin });
}

describe("parseHours — Glow Dental", () => {
  it("parses the am/pm form into the right weekly windows", () => {
    const s = parseHours(GLOW_AMPM)!;
    expect(s).not.toBeNull();
    closed(s, 0); // Sunday
    open(s, 1, 8 * 60, 17 * 60); // Mon 8:00–17:00
    open(s, 5, 8 * 60, 17 * 60); // Fri
    open(s, 6, 9 * 60, 13 * 60); // Sat 9:00–13:00
  });

  it("parses the 24h seed form identically", () => {
    const s = parseHours(GLOW_24H)!;
    open(s, 1, 8 * 60, 17 * 60);
    open(s, 6, 9 * 60, 13 * 60);
    closed(s, 0); // Sunday never mentioned → closed
  });

  it("Glow Sun is closed", () => {
    const s = parseHours(GLOW_AMPM)!;
    expect(isOpenOn(s, "2026-06-14")).toBe(false); // Sunday
  });

  it("Glow Sat 14:00 rejected (closes 1pm)", () => {
    const s = parseHours(GLOW_AMPM)!;
    // 2026-06-20 is a Saturday.
    expect(isWithinHours(s, "2026-06-20", "14:00")).toBe(false);
  });

  it("Glow Sat 11:00 valid", () => {
    const s = parseHours(GLOW_AMPM)!;
    expect(isWithinHours(s, "2026-06-20", "11:00")).toBe(true);
  });

  it("Glow Wed 16:30 valid (before 5pm close)", () => {
    const s = parseHours(GLOW_AMPM)!;
    // 2026-06-17 is a Wednesday.
    expect(isWithinHours(s, "2026-06-17", "16:30")).toBe(true);
  });

  it("Glow Wed 17:00 rejected (close is exclusive)", () => {
    const s = parseHours(GLOW_AMPM)!;
    expect(isWithinHours(s, "2026-06-17", "17:00")).toBe(false);
  });
});

describe("parseHours — Lux Salon", () => {
  it("parses the am/pm form: open Tue–Sat, closed Sun & Mon", () => {
    const s = parseHours(LUX_AMPM)!;
    closed(s, 0); // Sun
    closed(s, 1); // Mon
    open(s, 2, 10 * 60, 19 * 60); // Tue 10:00–19:00
    open(s, 6, 10 * 60, 19 * 60); // Sat
  });

  it("parses the 24h seed form (Tue–Sat, no explicit closed clause)", () => {
    const s = parseHours(LUX_24H)!;
    closed(s, 0); // Sun — never mentioned
    closed(s, 1); // Mon — never mentioned
    open(s, 2, 10 * 60, 19 * 60);
    open(s, 6, 10 * 60, 19 * 60);
  });

  it("Lux is closed Monday", () => {
    const s = parseHours(LUX_AMPM)!;
    expect(isOpenOn(s, "2026-06-15")).toBe(false); // Monday
  });

  it("Lux 09:00 rejected (opens 10am)", () => {
    const s = parseHours(LUX_AMPM)!;
    // 2026-06-16 is a Tuesday.
    expect(isWithinHours(s, "2026-06-16", "09:00")).toBe(false);
  });

  it("Lux 11:00 Tue valid", () => {
    const s = parseHours(LUX_AMPM)!;
    expect(isWithinHours(s, "2026-06-16", "11:00")).toBe(true);
  });
});

describe("parseHours — Hale & Park (by appointment)", () => {
  it("ignores the 'by appointment' modality and keeps the window", () => {
    const s = parseHours(HALE)!;
    open(s, 1, 9 * 60, 18 * 60); // Mon 9:00–18:00
    open(s, 5, 9 * 60, 18 * 60); // Fri
    closed(s, 6); // Sat — never mentioned
    closed(s, 0); // Sun — never mentioned
  });

  it("parses the 24h seed form identically", () => {
    const s = parseHours(HALE_24H)!;
    open(s, 1, 9 * 60, 18 * 60);
    closed(s, 6);
    closed(s, 0);
  });

  it("Hale is closed Saturday & Sunday", () => {
    const s = parseHours(HALE)!;
    expect(isOpenOn(s, "2026-06-20")).toBe(false); // Saturday
    expect(isOpenOn(s, "2026-06-21")).toBe(false); // Sunday
  });

  it("Hale Wed 10:00 valid", () => {
    const s = parseHours(HALE)!;
    // 2026-06-17 is a Wednesday.
    expect(isWithinHours(s, "2026-06-17", "10:00")).toBe(true);
  });
});

describe("slotsFor", () => {
  it("generates real on-the-grid slots within the open window", () => {
    const s = parseHours(LUX_AMPM)!;
    // Tuesday: opens 10:00, closes 19:00.
    const slots = slotsFor(s, "2026-06-16", { stepMin: 30, max: 4 });
    expect(slots).toEqual(["10:00", "10:30", "11:00", "11:30"]);
  });

  it("starts at the open time even off-grid, and stops before close", () => {
    // 9am–1pm Saturday for Glow.
    const s = parseHours(GLOW_AMPM)!;
    const slots = slotsFor(s, "2026-06-20", { stepMin: 60, max: 10 });
    // 09:00, 10:00, 11:00, 12:00 — 13:00 excluded (== close).
    expect(slots).toEqual(["09:00", "10:00", "11:00", "12:00"]);
  });

  it("returns [] on a closed day", () => {
    const s = parseHours(GLOW_AMPM)!;
    expect(slotsFor(s, "2026-06-14")).toEqual([]); // Sunday
  });

  it("returns [] for an unparseable schedule path (closed day)", () => {
    const s = parseHours(LUX_AMPM)!;
    expect(slotsFor(s, "2026-06-15")).toEqual([]); // Monday closed
  });
});

describe("isWithinHours — past-date and degrade behaviour", () => {
  it("a past date that lands on a closed day is rejected", () => {
    const s = parseHours(GLOW_AMPM)!;
    // 2020-01-05 was a Sunday → closed regardless of being in the past.
    expect(isWithinHours(s, "2020-01-05", "11:00")).toBe(false);
  });

  it("parseHours returns null for an unparseable string (degrade path)", () => {
    expect(parseHours("we are around most days, call us")).toBeNull();
    expect(parseHours("")).toBeNull();
    expect(parseHours(null)).toBeNull();
    expect(parseHours(undefined)).toBeNull();
  });

  it("parseHours returns null when only closures are stated (hours unknown)", () => {
    // "closed Sunday" alone tells us nothing about the open windows.
    expect(parseHours("closed Sunday")).toBeNull();
  });

  it("'Mon–Fri by appointment' with NO time yields null (can't confirm hours)", () => {
    // No parseable window anywhere → degrade-open rather than claim hours.
    expect(parseHours("Mon–Fri by appointment")).toBeNull();
  });
});

describe("describeDay — plain-language labels", () => {
  it("labels open and closed days for owner-facing notes", () => {
    const s = parseHours(GLOW_AMPM)!;
    expect(describeDay(s, 6)).toBe("Saturday 09:00–13:00");
    expect(describeDay(s, 0)).toBe("closed Sunday");
  });
});

// ── Adversarial-probe regression coverage: day-range/list phrasings + 24/7 ────
describe("parseHours — 'to' ranges, 'and'/'&' lists, comma lists (probe fixes)", () => {
  it("'Monday to Friday 9am-5pm' opens Mon–Fri (not just Monday)", () => {
    const s = parseHours("Monday to Friday 9am-5pm")!;
    expect(s).not.toBeNull();
    for (let d = 1; d <= 5; d++) open(s, d, 9 * 60, 17 * 60);
    closed(s, 0);
    closed(s, 6);
  });

  it("'Mon to Fri 8am-5pm' (abbrev + 'to') opens Mon–Fri", () => {
    const s = parseHours("Mon to Fri 8am-5pm")!;
    for (let d = 1; d <= 5; d++) open(s, d, 8 * 60, 17 * 60);
  });

  it("tolerates a stray leading word: 'open Monday to Friday 8am-5pm'", () => {
    const s = parseHours("open Monday to Friday 8am-5pm")!;
    for (let d = 1; d <= 5; d++) open(s, d, 8 * 60, 17 * 60);
  });

  it("'Mon and Wed 9am-5pm' opens Mon AND Wed, leaves Tue closed", () => {
    const s = parseHours("Mon and Wed 9am-5pm")!;
    open(s, 1, 9 * 60, 17 * 60);
    open(s, 3, 9 * 60, 17 * 60);
    closed(s, 2);
  });

  it("'Mon & Wed 9am-5pm' (ampersand) opens Mon AND Wed", () => {
    const s = parseHours("Mon & Wed 9am-5pm")!;
    open(s, 1, 9 * 60, 17 * 60);
    open(s, 3, 9 * 60, 17 * 60);
  });

  it("'Mon, Wed, Fri 9am-5pm' (comma list) opens all three via the pending buffer", () => {
    const s = parseHours("Mon, Wed, Fri 9am-5pm")!;
    open(s, 1, 9 * 60, 17 * 60);
    open(s, 3, 9 * 60, 17 * 60);
    open(s, 5, 9 * 60, 17 * 60);
    closed(s, 2);
    closed(s, 4);
  });
});

describe("parseHours — always-open phrasings (probe fix #5)", () => {
  it.each(["24/7", "24 / 7", "Open 24 hours", "always open"])(
    "%s opens every day all day",
    (text) => {
      const s = parseHours(text)!;
      expect(s).not.toBeNull();
      for (let d = 0; d <= 6; d++) open(s, d, 0, 24 * 60);
    },
  );
});
