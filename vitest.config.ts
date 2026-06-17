import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Convex functions run in an edge-runtime mock (closest to the Convex runtime).
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Compile-time contract assertions in *.test-d.ts run alongside runtime tests.
    typecheck: {
      enabled: true,
      checker: "tsc",
      tsconfig: "./tsconfig.json",
      include: ["**/*.test-d.ts"],
    },
  },
});
