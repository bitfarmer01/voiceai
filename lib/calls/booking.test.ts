import { describe, it, expect } from "vitest";
import { bookingFromStructuredData, formatSlot } from "./booking";

describe("bookingFromStructuredData", () => {
  const full = {
    booking: {
      confirmationId: "lead123",
      slot: "2026-06-18T14:00:00Z",
      customerName: "Sam Rivera",
      contact: "sam@example.com",
      service: "Deep clean",
      notes: "First visit",
      bookedAt: 1718719200000,
    },
  };

  it("extracts a complete booking", () => {
    expect(bookingFromStructuredData(full)).toEqual({
      confirmationId: "lead123",
      slot: "2026-06-18T14:00:00Z",
      customerName: "Sam Rivera",
      contact: "sam@example.com",
      service: "Deep clean",
      notes: "First visit",
      bookedAt: 1718719200000,
    });
  });

  it("defaults optional fields when absent", () => {
    expect(
      bookingFromStructuredData({ booking: { confirmationId: "x", slot: "14:00" } }),
    ).toEqual({
      confirmationId: "x",
      slot: "14:00",
      customerName: "",
      contact: "",
      service: null,
      notes: null,
      bookedAt: 0,
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "booking"],
    ["a number", 42],
    ["an object with no booking", { outcome: "booked" }],
    ["a null booking", { booking: null }],
    ["a non-object booking", { booking: "soon" }],
    ["a booking without confirmationId", { booking: { slot: "14:00" } }],
    ["a booking with an empty confirmationId", { booking: { confirmationId: "", slot: "14:00" } }],
  ])("returns null for %s", (_label, input) => {
    expect(bookingFromStructuredData(input)).toBeNull();
  });
});

describe("formatSlot", () => {
  it.each([
    ["09:00", "9:00 AM"],
    ["14:00", "2:00 PM"],
    ["00:30", "12:30 AM"],
    ["12:00", "12:00 PM"],
    ["23:45", "11:45 PM"],
  ])("formats wall-clock %s as %s", (input, out) => {
    expect(formatSlot(input)).toBe(out);
  });

  it.each([
    ["2026-06-18T14:00:00Z", "Jun 18, 2026 · 2:00 PM"],
    ["2026-06-18 14:00", "Jun 18, 2026 · 2:00 PM"],
    ["2026-06-18T09:05", "Jun 18, 2026 · 9:05 AM"],
  ])("formats datetime %s as %s", (input, out) => {
    expect(formatSlot(input)).toBe(out);
  });

  it("formats a bare date", () => {
    expect(formatSlot("2026-06-18")).toBe("Jun 18, 2026");
  });

  it("returns unknown shapes unchanged", () => {
    expect(formatSlot("next Tuesday")).toBe("next Tuesday");
    expect(formatSlot("")).toBe("");
  });
});
