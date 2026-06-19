import { describe, it, expect } from "vitest";
import { timeAgo, formatCount, formatDateTime } from "./format";

describe("timeAgo (long-form, pure)", () => {
  const now = 1_700_000_000_000;
  const mins = (n: number) => now - n * 60_000;

  it('reads "just now" under a minute', () => {
    expect(timeAgo(now, now)).toBe("just now");
    expect(timeAgo(mins(0.5), now)).toBe("just now");
  });

  it("rounds down to whole minutes", () => {
    expect(timeAgo(mins(1), now)).toBe("1 min ago");
    expect(timeAgo(mins(5), now)).toBe("5 min ago");
    expect(timeAgo(mins(59), now)).toBe("59 min ago");
  });

  it("switches to hours at 60 minutes", () => {
    expect(timeAgo(mins(60), now)).toBe("1 hr ago");
    expect(timeAgo(mins(60 * 23), now)).toBe("23 hr ago");
  });

  it('reads "yesterday" at exactly one day, then days', () => {
    expect(timeAgo(mins(60 * 24), now)).toBe("yesterday");
    expect(timeAgo(mins(60 * 24 * 2), now)).toBe("2 days ago");
    expect(timeAgo(mins(60 * 24 * 7), now)).toBe("7 days ago");
  });

  it("is pure — same inputs, same output (no internal clock)", () => {
    expect(timeAgo(mins(5), now)).toBe(timeAgo(mins(5), now));
  });
});

describe("formatCount (thousands separators, en-US)", () => {
  it("leaves small numbers unseparated", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(999)).toBe("999");
  });

  it("inserts a comma at thousands and beyond", () => {
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(12_345)).toBe("12,345");
    expect(formatCount(1_234_567)).toBe("1,234,567");
  });
});

describe("formatDateTime (locale-stable absolute timestamp)", () => {
  // Avoid asserting an exact wall-clock string (the machine timezone shifts it);
  // assert the fixed-format shape so a locale/format regression still fails.
  const out = formatDateTime(1_700_000_000_000);

  it("renders a short month, numeric day, 4-digit year and a time", () => {
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?(AM|PM)$/);
  });

  it("is deterministic for the same input", () => {
    expect(formatDateTime(1_700_000_000_000)).toBe(out);
  });
});
