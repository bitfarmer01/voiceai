import { expect, test } from "vitest";

test("vitest toolchain boots in edge-runtime", () => {
  // crypto.randomUUID exists in the Convex/edge runtime — proves the env is right.
  expect(typeof crypto.randomUUID()).toBe("string");
});
