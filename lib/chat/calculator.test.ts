import { describe, expect, it } from "vitest";
import { evaluateExpression } from "./calculator";

const ok = (e: string) => {
  const r = evaluateExpression(e);
  if ("error" in r) throw new Error(`unexpected error for "${e}": ${r.error}`);
  return r.result;
};

describe("evaluateExpression", () => {
  it("adds and subtracts", () => {
    expect(ok("1 + 2 - 3")).toBe(0);
  });
  it("honors precedence", () => {
    expect(ok("2 + 3 * 4")).toBe(14);
  });
  it("honors parentheses", () => {
    expect(ok("(2 + 3) * 4")).toBe(20);
  });
  it("handles unary minus", () => {
    expect(ok("-5 + 3")).toBe(-2);
    expect(ok("3 * -2")).toBe(-6);
  });
  it("handles decimals and percent (modulo)", () => {
    expect(ok("0.1 + 0.2")).toBeCloseTo(0.3, 10);
    expect(ok("10 % 3")).toBe(1);
  });
  it("handles exponent right-associatively", () => {
    expect(ok("2 ^ 3 ^ 2")).toBe(512);
  });
  it("errors on divide by zero", () => {
    expect(evaluateExpression("1 / 0")).toEqual({ error: expect.stringContaining("zero") });
  });
  it("errors on malformed input", () => {
    expect("error" in evaluateExpression("2 +")).toBe(true);
    expect("error" in evaluateExpression("abc")).toBe(true);
    expect("error" in evaluateExpression("")).toBe(true);
  });
});
