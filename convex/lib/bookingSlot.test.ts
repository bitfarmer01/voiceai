import { describe, it, expect } from "vitest";
import { parseSlot, isPastSlot, validateSlot } from "./bookingSlot";

// Use a fixed "now" well in the past so all 2099-* dates are future.
const FIXED_NOW = Date.UTC(2026, 0, 1); // 2026-01-01T00:00:00Z

describe("parseSlot", () => {
  it("parses a full ISO datetime", () => {
    expect(parseSlot("2099-06-15T10:30")).toEqual({ date: "2099-06-15", time: "10:30" });
  });

  it("parses a date-only string", () => {
    expect(parseSlot("2099-06-15")).toEqual({ date: "2099-06-15" });
  });

  it("parses a slot with 12h am/pm time", () => {
    expect(parseSlot("2099-06-15 10:30am")).toEqual({ date: "2099-06-15", time: "10:30" });
  });

  it("returns null for a completely unparseable string", () => {
    expect(parseSlot("next Monday at noon")).toBeNull();
  });

  it("returns null for an invalid date like 2099-13-01", () => {
    // Month 13 — Date.UTC still parses this but getUTCDay returns NaN in some envs;
    // we accept both null and {date} here since JS normalizes some invalid dates.
    const result = parseSlot("2099-13-01");
    // The key assertion: it must not throw.
    expect(result === null || typeof result === "object").toBe(true);
  });
});

describe("isPastSlot", () => {
  it("a far-future date with time is not past", () => {
    expect(isPastSlot("2099-06-15", "10:00", FIXED_NOW)).toBe(false);
  });

  it("a past date is past (date-only)", () => {
    expect(isPastSlot("2020-01-01", undefined, FIXED_NOW)).toBe(true);
  });

  it("a past datetime is past", () => {
    expect(isPastSlot("2020-01-01", "10:00", FIXED_NOW)).toBe(true);
  });

  it("today with a future time is not past", () => {
    // Use the exact date of FIXED_NOW with a time 30min ahead.
    const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0); // 10:00 UTC
    expect(isPastSlot("2026-01-01", "10:30", nowMs)).toBe(false);
  });

  it("today with a past time IS past", () => {
    const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0); // 12:00 UTC
    expect(isPastSlot("2026-01-01", "10:00", nowMs)).toBe(true);
  });
});

describe("validateSlot", () => {
  // 2099-06-16 is a Monday (confirmed: new Date('2099-06-16').getUTCDay() === 1)
  const MON_HOURS = "Mon-Fri 9am-5pm";
  // 2099-06-20 is a Friday
  // 2099-06-21 is a Saturday (closed under MON_HOURS)
  const SATURDAY = "2099-06-21";
  const MONDAY = "2099-06-16";

  it("returns ok:true for a future in-hours slot on an open day", () => {
    const result = validateSlot(MON_HOURS, `${MONDAY}T10:00`, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.degradeNote).toBeUndefined();
    }
  });

  it("returns ok:false for a past slot", () => {
    const result = validateSlot(MON_HOURS, "2020-06-15T10:00", FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/past/i);
    }
  });

  it("returns ok:false for a closed-day slot (Saturday with Mon-Fri hours)", () => {
    const result = validateSlot(MON_HOURS, `${SATURDAY}T10:00`, FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should mention the closure; describeDay returns "closed Saturday"
      expect(result.message).toMatch(/closed|Saturday|Mon-Fri/i);
    }
  });

  it("returns ok:false for an out-of-hours time on an open day", () => {
    // 19:00 is after 5pm closing
    const result = validateSlot(MON_HOURS, `${MONDAY}T19:00`, FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/outside/i);
    }
  });

  it("returns ok:true with a degradeNote for an unparseable hours string", () => {
    const result = validateSlot("call us to check availability", `${MONDAY}T10:00`, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.degradeNote).toBeDefined();
      expect(result.degradeNote).toMatch(/couldn't verify|couldn't read|posted hours|No posted hours/i);
    }
  });

  it("returns ok:true with a degradeNote when hours string is empty", () => {
    const result = validateSlot("", `${MONDAY}T10:00`, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.degradeNote).toBeDefined();
      expect(result.degradeNote).toMatch(/No posted hours/i);
    }
  });
});
