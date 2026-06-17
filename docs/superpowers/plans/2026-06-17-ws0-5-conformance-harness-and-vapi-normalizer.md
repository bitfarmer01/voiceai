# WS0.5 Contract-Conformance Harness + VAPI End-of-Call-Report Normalizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the test + CI foundation for the VAPI voice-receptionist repo and lock the frozen day-0 contracts with executable conformance checks, while extracting and correcting the VAPI end-of-call-report normalizer against the real report shape and aligning it to the `EngineEndOfCallReport` engine-adapter seam.

**Architecture:** Vitest 4 (edge-runtime environment) + `convex-test` for runtime tests, Vitest's built-in `expectTypeOf`/`assertType` for compile-time contract assertions, and a GitHub Actions CI gate. The VAPI normalizer moves out of the inline `mapEndOfCallReport` in `convex/http.ts` into a pure, tested module `convex/lib/vapiReport.ts` that produces the engine-agnostic `EngineEndOfCallReport` (from `convex/_contracts.ts`) plus a thin mapper to `recordEndOfCall`'s args. The conformance harness pins four seams: schema↔seed (runtime), `_contracts`↔`lib/types` (type), normalizer↔`EngineEndOfCallReport`↔`recordEndOfCall` args (type), and tool internals↔tool contracts (runtime).

**Tech Stack:** TypeScript 5 · Next.js 16 / React 19 · Convex 1.41 · Vitest 4.1.9 · `convex-test` 0.0.53 · `@edge-runtime/vm` 5.0.0 · pnpm · GitHub Actions.

## Global Constraints

These apply to **every** task. Copied verbatim from the repo's frozen-contract rules ([convex/_contracts.ts](../../../convex/_contracts.ts), [convex/schema.ts](../../../convex/schema.ts), [convex/seed.ts](../../../convex/seed.ts)) and the spec ([plan.md](../../../plan.md)):

- **Do not change `convex/schema.ts`, `convex/_contracts.ts`, or `lib/types.ts` field names/enums.** They are frozen day-0 contracts mirrored across every parallel workstream; this plan *verifies* them, it does not edit them. If a conformance test reveals a genuine drift, STOP and surface it — do not silently "fix" the contract.
- **`convex/_contracts.ts` stays pure:** zero side effects, no top-level IO, no `Date.now()`/`Math.random()`, and it MUST NOT import `./_generated/api` or `./_generated/server`. The new normalizer module may use `Date.parse(string)` (deterministic) but also must not use `Date.now()`/`Math.random()`.
- **Convex conventions:** object-form functions with `args` + `returns` validators; an index for every read path (no `.filter()` for WHERE); `internal*` for private functions; external IO only in actions; webhook + adapters as `httpAction`s.
- **`convex/_generated/` is committed and NOT git-ignored** — CI typecheck resolves `internal`/`api`/`Doc`/`Id` against the committed generated files. After any schema/function change, re-run `pnpm convex dev` (or `pnpm convex codegen`) locally and commit the regenerated `convex/_generated/`.
- **Tests live in two places:** runtime tests that need the Convex mock backend co-locate under `convex/` as `*.test.ts` (so `import.meta.glob("./**/*.ts")` resolves function modules); cross-boundary type tests live at repo-root `tests/*.test-d.ts`. Convex's deploy bundler ignores `*.test.ts`/`*.test-d.ts`, so co-located runtime tests are safe.
- **pnpm only.** Every command in this plan uses `pnpm` / `pnpm exec` / `pnpm dlx`.
- **Pin exact versions** when adding dependencies (listed per task) — do not float to `latest`.

---

## File Structure

New files this plan creates:

- `vitest.config.ts` (repo root) — Vitest config: `edge-runtime` environment, `convex-test` inlined, typecheck enabled.
- `tests/smoke.test.ts` — trivial runtime test proving the toolchain boots (deleted/kept as a sanity anchor).
- `convex/seed.test.ts` — runtime conformance: runs `internal.seed.seed`, asserts seeded rows exist and conform to schema.
- `convex/tools.test.ts` — runtime conformance: exercises the three tool internals against seeded data, asserts contract-shaped results + the search index works.
- `convex/lib/vapiReport.ts` — **pure** normalizer: `normalizeVapiEndOfCallReport(body) → EngineEndOfCallReport` and `engineReportToRecordArgs(report) → recordEndOfCall args`.
- `convex/lib/vapiReport.test.ts` — runtime unit tests for the normalizer against the captured fixture.
- `convex/lib/__fixtures__/vapiEndOfCallReport.ts` — a representative real-shape end-of-call-report webhook body (typed loosely as the raw body).
- `tests/contracts.test-d.ts` — compile-time conformance: `_contracts`↔`lib/types`, normalizer↔`EngineEndOfCallReport`↔`recordEndOfCall` args, plus a deliberate `@ts-expect-error` drift sentinel.
- `.github/workflows/ci.yml` — CI gate: install → typecheck → lint → test.

Files modified:

- `package.json` — add devDeps + `test`/`test:types`/`typecheck` scripts.
- `convex/http.ts` — replace inline `mapEndOfCallReport` with a call into `convex/lib/vapiReport.ts`; delete the now-dead inline normalizer.

Files read-only (verified, never edited): `convex/schema.ts`, `convex/_contracts.ts`, `convex/seed.ts`, `convex/tools.ts`, `convex/telemetry.ts`, `convex/calls.ts`, `lib/types.ts`.

---

## Task 1: Test + CI tooling foundation

Stand up Vitest with the Convex-compatible edge runtime and a git baseline so later task commits are reviewable diffs. The repo is a git repo with **zero commits** — establish the baseline first.

**Files:**
- Create: `vitest.config.ts`, `tests/smoke.test.ts`
- Modify: `package.json:5-10` (scripts), `package.json:29-38` (devDependencies)

**Interfaces:**
- Consumes: nothing (bootstrap).
- Produces: a working `pnpm test` (runtime + typecheck) and `pnpm typecheck`; the `edge-runtime` Vitest environment with `convex-test` inlined; a committed baseline of the existing scaffold.

- [ ] **Step 1: Create the git baseline commit of the existing scaffold**

The working tree has the entire scaffold untracked and no commits exist yet. Baseline it so subsequent commits are diffs.

Run:
```bash
cd /Users/rajathraghu/voiceai
git add -A
git status --short | head
```
Expected: a large list of `A` (added) entries including `app/`, `components/`, `convex/`, `lib/`, `package.json`. Confirm `convex/_generated/` IS staged and `.env.local` is NOT (it is git-ignored).

Then:
```bash
git commit -m "chore: baseline existing Next 16 + Convex + shadcn scaffold (pre-WS0.5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git log --oneline -1
```
Expected: one commit printed.

- [ ] **Step 2: Add the test toolchain dependencies (pinned)**

Run:
```bash
pnpm add -D vitest@4.1.9 @edge-runtime/vm@5.0.0 convex-test@0.0.53
```
Expected: `package.json` devDependencies now include `vitest`, `@edge-runtime/vm`, `convex-test`; `pnpm-lock.yaml` updated.

- [ ] **Step 3: Add scripts to `package.json`**

Replace the `scripts` block in [package.json](../../../package.json) so it reads exactly:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:types": "vitest run --typecheck",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 4: Create `vitest.config.ts`**

Create `vitest.config.ts` at the repo root with exactly:
```ts
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
```

- [ ] **Step 5: Write the smoke test (RED)**

Create `tests/smoke.test.ts` with exactly:
```ts
import { expect, test } from "vitest";

test("vitest toolchain boots in edge-runtime", () => {
  // crypto.randomUUID exists in the Convex/edge runtime — proves the env is right.
  expect(typeof crypto.randomUUID()).toBe("string");
});
```

- [ ] **Step 6: Run the smoke test to verify it passes**

Run:
```bash
pnpm test
```
Expected: `tests/smoke.test.ts` passes (1 passed). If `pnpm test` errors with "Cannot find module '@edge-runtime/vm'", re-run Step 2. The typecheck pass should report no type-test files yet (or 0 typecheck errors).

- [ ] **Step 7: Verify project-wide typecheck is green**

Run:
```bash
pnpm typecheck
```
Expected: exits 0 (no errors). If pre-existing errors surface in unrelated files, STOP and report — the scaffold should already typecheck since it builds.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/smoke.test.ts
git commit -m "test: add vitest + convex-test toolchain and CI scripts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Seed ↔ schema runtime conformance

Pin the seed against the schema: running `internal.seed.seed` in the `convex-test` mock validates every insert against `convex/schema.ts` (an off-contract insert throws), and we additionally assert row counts and referential invariants. This is the WS0.5 guard that catches seed/schema drift in CI instead of by a human.

**Files:**
- Create: `convex/seed.test.ts`
- Read-only: `convex/seed.ts`, `convex/schema.ts`

**Interfaces:**
- Consumes: `internal.seed.seed` (`internalMutation`, args `{}`, returns `null`); schema tables `businesses`, `knowledgeChunks`, `providerStats`, `calls`, `budgetState`.
- Produces: a regression guard asserting the seed conforms to the frozen schema.

- [ ] **Step 1: Write the seed conformance test (RED until module resolves)**

Create `convex/seed.test.ts` with exactly:
```ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

// convex-test loads every function module for the mock backend.
const modules = import.meta.glob("./**/*.ts");

describe("seed conforms to the frozen schema", () => {
  test("populates all seeded tables with valid rows", async () => {
    const t = convexTest(schema, modules);

    // If any insert violates schema, convexTest throws here.
    await t.mutation(internal.seed.seed, {});

    const { businesses, chunks, providerStats, calls, budget } = await t.run(
      async (ctx) => ({
        businesses: await ctx.db.query("businesses").collect(),
        chunks: await ctx.db.query("knowledgeChunks").collect(),
        providerStats: await ctx.db.query("providerStats").collect(),
        calls: await ctx.db.query("calls").collect(),
        budget: await ctx.db.query("budgetState").collect(),
      }),
    );

    // Row-count invariants (mirror convex/seed.ts).
    expect(businesses).toHaveLength(3);
    expect(chunks).toHaveLength(12); // 4 chunks × 3 presets
    expect(providerStats).toHaveLength(8);
    expect(calls).toHaveLength(12);
    expect(budget).toHaveLength(1); // singleton

    // Referential integrity: every call's businessId is a real business.
    const businessIds = new Set(businesses.map((b) => b._id));
    for (const call of calls) {
      expect(businessIds.has(call.businessId)).toBe(true);
    }

    // providerStats kinds are within the frozen ProviderKind enum.
    for (const s of providerStats) {
      expect(["stt", "tts", "llm"]).toContain(s.kind);
      expect(["native", "custom"]).toContain(s.source);
    }
  });

  test("is idempotent — re-running yields identical row counts", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seed, {});
    await t.mutation(internal.seed.seed, {});
    const calls = await t.run((ctx) => ctx.db.query("calls").collect());
    expect(calls).toHaveLength(12); // clear-then-insert, not append
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run:
```bash
pnpm exec vitest run convex/seed.test.ts
```
Expected: 2 passed. If a count assertion fails, the seed drifted from this spec — read `convex/seed.ts`, reconcile the expected count to the actual seed (the seed is the source of truth for counts), and re-run. If a *schema* validation error throws inside `t.mutation`, STOP: the seed violates the frozen schema and that is a real bug to surface.

- [ ] **Step 3: Commit**

```bash
git add convex/seed.test.ts
git commit -m "test: pin seed against the frozen schema (WS0.5 conformance)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: VAPI end-of-call-report normalizer (fixture + correct extraction)

The normalizer is the "real-VAPI-report spike" the parallel plan flagged for WS0. The current inline `mapEndOfCallReport` in `convex/http.ts:240-314` was written defensively (littered with `TODO(vapi-shape)`) and is wrong against the real VAPI shape: it reads `message.costBreakdown` (the rollup is at `message.call.costBreakdown`), `message.durationSeconds` (does not exist — derive from `startedAt`/`endedAt`), and `message.performanceMetrics.ttfwMs` (latency lives at `message.artifact.performanceMetrics`). This task writes the correct behavior as a failing test first, implements a pure module to satisfy it, and aligns the output to the `EngineEndOfCallReport` engine-adapter contract.

**Files:**
- Create: `convex/lib/__fixtures__/vapiEndOfCallReport.ts`, `convex/lib/vapiReport.ts`, `convex/lib/vapiReport.test.ts`
- Read-only: `convex/_contracts.ts` (`EngineEndOfCallReport`)

**Interfaces:**
- Consumes: `EngineEndOfCallReport` and `EngineKind` types from `convex/_contracts.ts`.
- Produces:
  - `normalizeVapiEndOfCallReport(body: unknown): EngineEndOfCallReport | null` — `null` when the body lacks a call id.
  - `engineReportToRecordArgs(report: EngineEndOfCallReport): { vapiCallId: string; durationSec: number; costUsd: number; costBreakdown: { stt: number; llm: number; tts: number; platform: number }; summary?: string; structuredData?: unknown; successEval?: boolean; languages?: string[]; ttfwMs?: number }` — shape matches `internal.calls.recordEndOfCall` args exactly.

- [ ] **Step 1: Create the real-shape fixture**

Create `convex/lib/__fixtures__/vapiEndOfCallReport.ts` with exactly (field paths verified against the VAPI server SDK `ServerMessageEndOfCallReport`/`Artifact`/`PerformanceMetrics`/`CostBreakdown` types — cost rollup at `message.call.costBreakdown`, latency at `message.artifact.performanceMetrics`, no native `durationSeconds`):
```ts
/**
 * Representative VAPI `end-of-call-report` webhook body (the value of the POST
 * JSON, i.e. `{ message: {...} }`). Field nesting matches the VAPI server SDK:
 *   - cost rollup at message.call.costBreakdown (stt/llm/tts/vapi/transport/total)
 *   - latency at message.artifact.performanceMetrics (averages + turnLatencies[])
 *   - NO message.durationSeconds — derive duration from startedAt/endedAt
 * Typed loosely as the raw webhook body the normalizer accepts as `unknown`.
 */
export const VAPI_END_OF_CALL_REPORT: unknown = {
  message: {
    type: "end-of-call-report",
    endedReason: "customer-ended-call",
    timestamp: 1781611404000,
    startedAt: "2026-06-16T10:00:00.000Z",
    endedAt: "2026-06-16T10:03:24.000Z", // 204s
    cost: 0.182,
    costs: [
      { type: "transport", minutes: 3.4, cost: 0.0204 },
      { type: "transcriber", transcriber: { provider: "deepgram", model: "nova-2" }, minutes: 3.4, cost: 0.0146 },
      { type: "model", model: { provider: "openai", model: "gpt-4o-mini" }, promptTokens: 4210, completionTokens: 380, cost: 0.0931 },
      { type: "voice", voice: { provider: "cartesia", voiceId: "sonic" }, characters: 1240, cost: 0.0432 },
      { type: "vapi", subType: "normal", minutes: 3.4, cost: 0.017 },
      { type: "analysis", analysisType: "summary", promptTokens: 980, completionTokens: 120, cost: 0.0037 },
    ],
    analysis: {
      summary: "Customer asked about pricing and booked a cleaning.",
      structuredData: { intent: "booking", booked: true },
      successEvaluation: "true",
    },
    artifact: {
      transcript: "AI: Hello!\nUser: I'd like to book a cleaning...\n",
      recordingUrl: "https://example.test/mono.wav",
      messages: [
        { role: "bot", message: "Hello!", time: 1781611201000, endTime: 1781611202100, secondsFromStart: 1.0, duration: 1.1 },
      ],
      performanceMetrics: {
        modelLatencyAverage: 540,
        voiceLatencyAverage: 210,
        transcriberLatencyAverage: 180,
        endpointingLatencyAverage: 320,
        turnLatencyAverage: 1180,
        numUserInterrupted: 1,
        numAssistantInterrupted: 0,
        turnLatencies: [
          { modelLatency: 520, voiceLatency: 200, transcriberLatency: 175, endpointingLatency: 300, turnLatency: 1150 },
        ],
      },
    },
    call: {
      id: "vapi_call_abc123",
      costBreakdown: {
        transport: 0.0204,
        stt: 0.0146,
        llm: 0.0931,
        tts: 0.0432,
        vapi: 0.017,
        total: 0.182,
        llmPromptTokens: 4210,
        llmCompletionTokens: 380,
        ttsCharacters: 1240,
      },
    },
  },
};

/**
 * A degraded report: VAPI omits performanceMetrics (opt-in / often absent) and
 * call.costBreakdown, leaving only the costs[] array and top-level cost. The
 * normalizer must still produce a valid EngineEndOfCallReport (latencies undefined,
 * costBreakdown reconstructed from costs[]).
 */
export const VAPI_END_OF_CALL_REPORT_MINIMAL: unknown = {
  message: {
    type: "end-of-call-report",
    startedAt: "2026-06-16T10:00:00.000Z",
    endedAt: "2026-06-16T10:00:48.000Z", // 48s
    cost: 0.05,
    costs: [
      { type: "transcriber", transcriber: { provider: "deepgram" }, cost: 0.01 },
      { type: "model", model: { provider: "openai" }, cost: 0.02 },
      { type: "voice", voice: { provider: "cartesia" }, cost: 0.015 },
      { type: "vapi", cost: 0.005 },
    ],
    analysis: { successEvaluation: "false" },
    artifact: {},
    call: { id: "vapi_call_minimal" },
  },
};

/** A non-report message (status-update) the normalizer must reject with null. */
export const VAPI_STATUS_UPDATE: unknown = {
  message: { type: "status-update", status: "in-progress" },
};
```

- [ ] **Step 2: Write the normalizer unit test (RED — module does not exist yet)**

Create `convex/lib/vapiReport.test.ts` with exactly:
```ts
import { describe, expect, test } from "vitest";
import {
  normalizeVapiEndOfCallReport,
  engineReportToRecordArgs,
} from "./vapiReport";
import {
  VAPI_END_OF_CALL_REPORT,
  VAPI_END_OF_CALL_REPORT_MINIMAL,
  VAPI_STATUS_UPDATE,
} from "./__fixtures__/vapiEndOfCallReport";

describe("normalizeVapiEndOfCallReport", () => {
  test("extracts the full report from the real shape", () => {
    const r = normalizeVapiEndOfCallReport(VAPI_END_OF_CALL_REPORT);
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.engine).toBe("vapi");
    expect(r.engineCallId).toBe("vapi_call_abc123");

    // Duration derived from startedAt/endedAt (204s), NOT a missing duration field.
    expect(r.durationSec).toBe(204);

    expect(r.costUsd).toBeCloseTo(0.182, 5);

    // costBreakdown comes from message.call.costBreakdown; platform = vapi + transport.
    expect(r.costBreakdown.stt).toBeCloseTo(0.0146, 5);
    expect(r.costBreakdown.llm).toBeCloseTo(0.0931, 5);
    expect(r.costBreakdown.tts).toBeCloseTo(0.0432, 5);
    expect(r.costBreakdown.platform).toBeCloseTo(0.017 + 0.0204, 5);

    // Latency from message.artifact.performanceMetrics.
    expect(r.componentLatencyMs.stt).toBe(180);
    expect(r.componentLatencyMs.llm).toBe(540);
    expect(r.componentLatencyMs.tts).toBe(210);
    expect(r.componentLatencyMs.ttfw).toBe(1150); // first turnLatencies[].turnLatency

    expect(r.summary).toBe("Customer asked about pricing and booked a cleaning.");
    expect(r.structuredData).toEqual({ intent: "booking", booked: true });
    expect(r.successEval).toBe(true);
  });

  test("handles a minimal report: no performanceMetrics, no call.costBreakdown", () => {
    const r = normalizeVapiEndOfCallReport(VAPI_END_OF_CALL_REPORT_MINIMAL);
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.engineCallId).toBe("vapi_call_minimal");
    expect(r.durationSec).toBe(48);
    // costBreakdown reconstructed from costs[].
    expect(r.costBreakdown.stt).toBeCloseTo(0.01, 5);
    expect(r.costBreakdown.llm).toBeCloseTo(0.02, 5);
    expect(r.costBreakdown.tts).toBeCloseTo(0.015, 5);
    expect(r.costBreakdown.platform).toBeCloseTo(0.005, 5);
    // No latency reported.
    expect(r.componentLatencyMs.stt).toBeUndefined();
    expect(r.componentLatencyMs.llm).toBeUndefined();
    expect(r.componentLatencyMs.tts).toBeUndefined();
    expect(r.componentLatencyMs.ttfw).toBeUndefined();
    expect(r.successEval).toBe(false);
    expect(r.summary).toBeUndefined();
  });

  test("returns null for a non-report message", () => {
    expect(normalizeVapiEndOfCallReport(VAPI_STATUS_UPDATE)).toBeNull();
  });

  test("returns null when there is no call id", () => {
    expect(
      normalizeVapiEndOfCallReport({ message: { type: "end-of-call-report" } }),
    ).toBeNull();
  });
});

describe("engineReportToRecordArgs", () => {
  test("maps the engine report to recordEndOfCall args", () => {
    const report = normalizeVapiEndOfCallReport(VAPI_END_OF_CALL_REPORT)!;
    const args = engineReportToRecordArgs(report);

    expect(args.vapiCallId).toBe("vapi_call_abc123");
    expect(args.durationSec).toBe(204);
    expect(args.costUsd).toBeCloseTo(0.182, 5);
    expect(args.costBreakdown).toEqual(report.costBreakdown);
    expect(args.ttfwMs).toBe(1150); // from componentLatencyMs.ttfw
    expect(args.summary).toBe(report.summary);
    expect(args.successEval).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails for the right reason**

Run:
```bash
pnpm exec vitest run convex/lib/vapiReport.test.ts
```
Expected: FAIL — `Failed to resolve import "./vapiReport"` (the module does not exist yet).

- [ ] **Step 4: Implement the pure normalizer module**

Create `convex/lib/vapiReport.ts` with exactly:
```ts
/**
 * Pure VAPI end-of-call-report normalizer (the WS0 "real-VAPI-report spike").
 *
 * Reduces VAPI's `end-of-call-report` webhook body to the engine-agnostic
 * `EngineEndOfCallReport` (convex/_contracts.ts), then maps that to the
 * `recordEndOfCall` mutation args. Field paths match the VAPI server SDK:
 *   - call id            → message.call.id (fallback message.callId)
 *   - total cost         → message.cost (fallback message.call.costBreakdown.total)
 *   - component cost     → message.call.costBreakdown {stt,llm,tts,vapi,transport}
 *                          (fallback: reduce message.costs[] by type)
 *   - duration           → (endedAt - startedAt) / 1000  (NO native duration field)
 *   - latency            → message.artifact.performanceMetrics (often absent)
 *   - analysis           → message.analysis {summary,structuredData,successEvaluation}
 *
 * PURE: no Date.now()/Math.random(), no IO. Date.parse(string) is deterministic.
 */
import type { EngineEndOfCallReport, EngineKind } from "../_contracts";

const ENGINE: EngineKind = "vapi";

function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function num(x: unknown): number | undefined {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function str(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

function unwrapMessage(body: unknown): Record<string, unknown> {
  const msg = pick(body, "message");
  if (msg && typeof msg === "object") return msg as Record<string, unknown>;
  if (body && typeof body === "object") return body as Record<string, unknown>;
  return {};
}

/** Reduce message.costs[] by type into a {stt,llm,tts,platform} breakdown. */
function costsBreakdown(msg: Record<string, unknown>): {
  stt: number;
  llm: number;
  tts: number;
  platform: number;
} {
  const out = { stt: 0, llm: 0, tts: 0, platform: 0 };
  const costs = msg.costs;
  if (!Array.isArray(costs)) return out;
  for (const raw of costs) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const cost = num(c.cost) ?? 0;
    switch (c.type) {
      case "transcriber": out.stt += cost; break;
      case "model": out.llm += cost; break;
      case "voice": out.tts += cost; break;
      case "transport":
      case "vapi":
      case "analysis":
      case "knowledge-base":
      case "voicemail-detection":
      default: out.platform += cost; break;
    }
  }
  return out;
}

function successFrom(x: unknown): boolean | undefined {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") {
    const s = x.toLowerCase();
    if (s === "true" || s === "pass" || s === "success") return true;
    if (s === "false" || s === "fail") return false;
  }
  return undefined;
}

/**
 * Normalize a VAPI end-of-call-report webhook body. Returns null when the body
 * is not an end-of-call report or carries no call id.
 */
export function normalizeVapiEndOfCallReport(
  body: unknown,
): EngineEndOfCallReport | null {
  const msg = unwrapMessage(body);
  if (str(msg.type) !== "end-of-call-report") return null;

  const engineCallId =
    str(pick(msg, "call", "id")) ?? str(msg.callId) ?? str(pick(msg, "call", "callId"));
  if (!engineCallId) return null;

  // Duration: derive from ISO startedAt/endedAt (no native duration field).
  const startedAt = str(msg.startedAt);
  const endedAt = str(msg.endedAt);
  let durationSec = 0;
  if (startedAt && endedAt) {
    const s = Date.parse(startedAt);
    const e = Date.parse(endedAt);
    if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
      durationSec = Math.round((e - s) / 1000);
    }
  }

  // Cost: prefer the message.call.costBreakdown rollup, else reduce costs[].
  const cb = pick(msg, "call", "costBreakdown") as
    | Record<string, unknown>
    | undefined;
  let breakdown: { stt: number; llm: number; tts: number; platform: number };
  if (cb) {
    const stt = num(cb.stt) ?? 0;
    const llm = num(cb.llm) ?? 0;
    const tts = num(cb.tts) ?? 0;
    const vapi = num(cb.vapi) ?? 0;
    const transport = num(cb.transport) ?? 0;
    const total = num(cb.total);
    const platform =
      vapi + transport > 0
        ? vapi + transport
        : total !== undefined
          ? Math.max(0, total - stt - llm - tts)
          : 0;
    breakdown = { stt, llm, tts, platform };
  } else {
    breakdown = costsBreakdown(msg);
  }

  const costUsd =
    num(msg.cost) ??
    num(pick(msg, "call", "costBreakdown", "total")) ??
    breakdown.stt + breakdown.llm + breakdown.tts + breakdown.platform;

  // Latency: message.artifact.performanceMetrics (often absent → undefined).
  const pm = pick(msg, "artifact", "performanceMetrics") as
    | Record<string, unknown>
    | undefined;
  const firstTurn = pick(pm, "turnLatencies", "0") as
    | Record<string, unknown>
    | undefined;
  const componentLatencyMs = {
    stt: num(pm?.transcriberLatencyAverage),
    llm: num(pm?.modelLatencyAverage),
    tts: num(pm?.voiceLatencyAverage),
    ttfw: num(firstTurn?.turnLatency) ?? num(pm?.turnLatencyAverage),
  };

  const summary = str(pick(msg, "analysis", "summary"));
  const structuredData = pick(msg, "analysis", "structuredData");
  const successEval = successFrom(pick(msg, "analysis", "successEvaluation"));

  return {
    engine: ENGINE,
    engineCallId,
    durationSec,
    costUsd,
    costBreakdown: breakdown,
    componentLatencyMs,
    summary,
    structuredData,
    successEval,
  };
}

/** Args of internal.calls.recordEndOfCall — kept structurally in lock-step. */
export interface RecordEndOfCallArgs {
  vapiCallId: string;
  durationSec: number;
  costUsd: number;
  costBreakdown: { stt: number; llm: number; tts: number; platform: number };
  summary?: string;
  structuredData?: unknown;
  successEval?: boolean;
  languages?: string[];
  ttfwMs?: number;
}

/** Map the engine-agnostic report to recordEndOfCall's args. */
export function engineReportToRecordArgs(
  report: EngineEndOfCallReport,
): RecordEndOfCallArgs {
  return {
    vapiCallId: report.engineCallId,
    durationSec: report.durationSec,
    costUsd: report.costUsd,
    costBreakdown: report.costBreakdown,
    summary: report.summary,
    structuredData: report.structuredData,
    successEval: report.successEval,
    // languages are not reliably present in the VAPI report; left undefined.
    languages: undefined,
    ttfwMs: report.componentLatencyMs.ttfw,
  };
}
```

- [ ] **Step 5: Run the normalizer tests to verify they pass**

Run:
```bash
pnpm exec vitest run convex/lib/vapiReport.test.ts
```
Expected: all tests pass (the `describe` blocks green). If `componentLatencyMs.ttfw` is wrong, recheck the `turnLatencies[0].turnLatency` path in Step 4.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/vapiReport.ts convex/lib/vapiReport.test.ts convex/lib/__fixtures__/vapiEndOfCallReport.ts
git commit -m "feat: pure VAPI end-of-call-report normalizer aligned to EngineEndOfCallReport

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire the webhook to the normalizer

Replace the inline, defensive `mapEndOfCallReport` in `convex/http.ts` with the tested module so the webhook and the engine-adapter seam share one normalizer. The webhook scheduler call into `internal.calls.recordEndOfCall` is preserved; only the normalization source changes.

**Files:**
- Modify: `convex/http.ts:194-205` (webhook branch), `convex/http.ts:227-314` (delete `mapEndOfCallReport`), `convex/http.ts:22-26` (imports)

**Interfaces:**
- Consumes: `normalizeVapiEndOfCallReport`, `engineReportToRecordArgs` from `convex/lib/vapiReport.ts`.
- Produces: a webhook that finalizes calls via the shared normalizer; `internal.calls.recordEndOfCall` args unchanged.

- [ ] **Step 1: Import the normalizer in `convex/http.ts`**

In [convex/http.ts](../../../convex/http.ts), add to the import block near the top (after the `_contracts` import at line 25):
```ts
import {
  normalizeVapiEndOfCallReport,
  engineReportToRecordArgs,
} from "./lib/vapiReport";
```

- [ ] **Step 2: Rewrite the `end-of-call-report` branch**

Replace the `case "end-of-call-report":` block (lines ~194-205) with exactly:
```ts
    case "end-of-call-report": {
      const report = normalizeVapiEndOfCallReport(body);
      if (report) {
        // Off-path: finalize the call in a scheduled internal mutation.
        await ctx.scheduler.runAfter(
          0,
          internal.calls.recordEndOfCall,
          engineReportToRecordArgs(report),
        );
      }
      return json({ ok: true }, 200);
    }
```
Note: `normalizeVapiEndOfCallReport` takes the **raw body** (it unwraps `message` itself), so pass `body`, not `msg`.

- [ ] **Step 3: Delete the dead inline normalizer**

Remove the entire `mapEndOfCallReport` function (the block from the `/** Reduce VAPI's end-of-call-report ... */` comment through its closing `}` — lines ~227-314). The helper functions `pick`, `asNumber`, `asString`, `unwrapMessage` remain (they are still used by `extractToolCalls`).

- [ ] **Step 4: Verify nothing else referenced `mapEndOfCallReport`**

Run:
```bash
grep -rn "mapEndOfCallReport" convex/
```
Expected: no matches.

- [ ] **Step 5: Typecheck the change**

Run:
```bash
pnpm typecheck
```
Expected: exits 0. If `asNumber`/`asString` are now reported unused, confirm they are still used by `extractToolCalls` (they are) — do not delete them.

- [ ] **Step 6: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: all runtime tests pass, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add convex/http.ts
git commit -m "refactor: webhook uses the shared VAPI normalizer (delete inline mapEndOfCallReport)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Compile-time contract conformance

Pin the type seams that runtime tests cannot: that `convex/_contracts.ts` mirrors `lib/types.ts` exactly, that the normalizer output IS an `EngineEndOfCallReport`, and that `engineReportToRecordArgs`'s output is assignable to the real `internal.calls.recordEndOfCall` args (via Convex's `FunctionArgs`). A deliberate `@ts-expect-error` sentinel proves the harness fails on drift.

**Files:**
- Create: `tests/contracts.test-d.ts`
- Read-only: `convex/_contracts.ts`, `lib/types.ts`, `convex/_generated/api.d.ts`

**Interfaces:**
- Consumes: `TraceSpan`/`SpanKind`/`GuardReason`/`EngineEndOfCallReport` from `convex/_contracts.ts`; `TraceSpan`/`SpanKind`/`GuardReason` from `lib/types.ts`; `RecordEndOfCallArgs` + the two normalizer functions from `convex/lib/vapiReport.ts`; `FunctionArgs` from `convex/server`; `internal` from `convex/_generated/api`.
- Produces: a compile-time guard; CI fails if any mirrored type drifts.

- [ ] **Step 1: Write the type-level conformance test (it should compile clean = PASS)**

Create `tests/contracts.test-d.ts` with exactly (relative imports so no path-alias config is needed):
```ts
import { assertType, expectTypeOf, test } from "vitest";
import type { FunctionArgs } from "convex/server";
import { internal } from "../convex/_generated/api";

import type {
  TraceSpan as ContractTraceSpan,
  SpanKind as ContractSpanKind,
  GuardReason as ContractGuardReason,
  EngineEndOfCallReport,
} from "../convex/_contracts";
import type {
  TraceSpan as UiTraceSpan,
  SpanKind as UiSpanKind,
  GuardReason as UiGuardReason,
} from "../lib/types";
import {
  normalizeVapiEndOfCallReport,
  engineReportToRecordArgs,
  type RecordEndOfCallArgs,
} from "../convex/lib/vapiReport";

test("_contracts mirrors lib/types (no drift)", () => {
  // The frozen OTel span + enums must be identical on both sides of the seam.
  expectTypeOf<ContractTraceSpan>().toEqualTypeOf<UiTraceSpan>();
  expectTypeOf<ContractSpanKind>().toEqualTypeOf<UiSpanKind>();
  expectTypeOf<ContractGuardReason>().toEqualTypeOf<UiGuardReason>();
});

test("normalizer output IS an EngineEndOfCallReport", () => {
  const r = normalizeVapiEndOfCallReport({} as unknown);
  // Returns the report or null; the non-null branch must equal the contract.
  expectTypeOf(r).toEqualTypeOf<EngineEndOfCallReport | null>();
});

test("engineReportToRecordArgs is assignable to recordEndOfCall's real args", () => {
  type RealArgs = FunctionArgs<typeof internal.calls.recordEndOfCall>;
  const args: RecordEndOfCallArgs = engineReportToRecordArgs(
    {} as EngineEndOfCallReport,
  );
  // The mapper's output must satisfy the actual Convex mutation arg type.
  assertType<RealArgs>(args);
});

test("DRIFT SENTINEL — a wrong span kind must not be assignable", () => {
  // @ts-expect-error "network" is not a valid SpanKind; if this ever compiles,
  // the frozen SpanKind enum has drifted and CI must fail here.
  const bad: ContractSpanKind = "network";
  void bad;
});
```

- [ ] **Step 2: Run the type tests**

Run:
```bash
pnpm run test:types
```
Expected: type tests pass. The `@ts-expect-error` line is *expected* to suppress a real error (so the test passes). If Vitest reports the `@ts-expect-error` is "unused", that means `"network"` became assignable — a real drift — STOP and report.

- [ ] **Step 3: Verify project-wide typecheck still clean**

Run:
```bash
pnpm typecheck
```
Expected: exits 0. (`tests/contracts.test-d.ts` is included by the root tsconfig `**/*.ts`; its `@ts-expect-error` is honored project-wide too.)

- [ ] **Step 4: Prove the sentinel actually bites (temporary edit)**

Temporarily change the sentinel line to a *valid* kind to confirm the harness would catch drift:
```ts
  const bad: ContractSpanKind = "tts";
```
Run `pnpm run test:types`. Expected: FAIL — Vitest reports an unused `@ts-expect-error`. Then **revert** the line back to `"network"` and re-run `pnpm run test:types` to confirm it passes again. (This step verifies the guard is live; the file must end reverted.)

- [ ] **Step 5: Commit**

```bash
git add tests/contracts.test-d.ts
git commit -m "test: compile-time contract conformance (_contracts mirror, normalizer, recordEndOfCall args)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Tool internals runtime conformance

Exercise the three receptionist tool internals against seeded data so the `returns` validators (the frozen tool contracts) are run end-to-end and the `knowledgeChunks` search index actually returns grounded chunks. This guards the WS5↔contract seam before the live call loop depends on it.

**Files:**
- Create: `convex/tools.test.ts`
- Read-only: `convex/tools.ts`, `convex/_contracts.ts`

**Interfaces:**
- Consumes: `internal.seed.seed`; `internal.tools.lookupKnowledge` (returns `LookupKnowledgeResult`), `internal.tools.checkAvailability` (returns `CheckAvailabilityResult`), `internal.tools.bookAppointment` (returns `BookAppointmentResult`).
- Produces: a runtime guard that the tools return contract-shaped results and that retrieval is grounded.

- [ ] **Step 1: Write the tool conformance test (RED until it runs green)**

Create `convex/tools.test.ts` with exactly:
```ts
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seededBusinessId(
  t: ReturnType<typeof convexTest>,
): Promise<Id<"businesses">> {
  await t.mutation(internal.seed.seed, {});
  const id = await t.run(async (ctx) => {
    const biz = await ctx.db
      .query("businesses")
      .withIndex("by_kind", (q) => q.eq("kind", "preset"))
      .first();
    return biz?._id ?? null;
  });
  if (!id) throw new Error("seed produced no preset business");
  return id;
}

describe("lookup_knowledge", () => {
  test("returns grounded chunks for a matching query", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    const res = await t.query(internal.tools.lookupKnowledge, {
      businessId,
      query: "hours open",
    });
    expect(res.found).toBe(true);
    expect(Array.isArray(res.chunks)).toBe(true);
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(typeof res.chunks[0].text).toBe("string");
  });
});

describe("check_availability", () => {
  test("returns slots on a weekday", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // 2026-06-15 is a Monday.
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-15",
    });
    expect(res.available).toBe(true);
    expect(res.slots.length).toBeGreaterThan(0);
  });

  test("is closed on Sunday", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);
    // 2026-06-14 is a Sunday.
    const res = await t.query(internal.tools.checkAvailability, {
      businessId,
      date: "2026-06-14",
    });
    expect(res.available).toBe(false);
    expect(res.slots).toHaveLength(0);
  });
});

describe("book_appointment", () => {
  test("books and is idempotent on the same key", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seededBusinessId(t);

    const first = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-15T09:00:00.000Z",
      customerName: "Test Caller",
      contact: "test@example.com",
      idempotencyKey: "abc-123",
    });
    expect(first.booked).toBe(true);
    expect(first.confirmationId).not.toBe("");

    const second = await t.mutation(internal.tools.bookAppointment, {
      businessId,
      slot: "2026-06-15T09:00:00.000Z",
      customerName: "Test Caller",
      contact: "test@example.com",
      idempotencyKey: "abc-123",
    });
    expect(second.booked).toBe(true);
    // Idempotent retry reuses the same confirmation.
    expect(second.confirmationId).toBe(first.confirmationId);
  });
});
```

- [ ] **Step 2: Run it**

Run:
```bash
pnpm exec vitest run convex/tools.test.ts
```
Expected: all tests pass. If `book_appointment` reports "No active call to attach the booking to", that means the seed's calls don't include one for this preset business — adjust the test to first insert a `live` call via `t.run` for `businessId`, OR confirm a seeded call references it. (The seed inserts calls for preset businesses by name, so a preset business has anchor calls; if not, prepend a `t.run` insert of a minimal `calls` row with `status:"live"` for `businessId`.)

- [ ] **Step 3: Commit**

```bash
git add convex/tools.test.ts
git commit -m "test: runtime conformance for the three receptionist tool internals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: CI gate

Add the GitHub Actions workflow that runs the whole harness on every push/PR: install → project-wide typecheck → lint → tests (runtime + type-level). The repo already has `convex/_generated/` committed, so typecheck needs no Convex credentials.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm typecheck`, `pnpm lint`, `pnpm test` (the scripts from Task 1).
- Produces: a CI gate.

- [ ] **Step 1: Verify the exact commands pass locally first**

Run, in order:
```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: all three exit 0. Fix any failure before writing CI (CI must mirror a known-green local run). If `pnpm lint` flags the new files, address lint findings (e.g. unused imports) and re-commit to the relevant task before proceeding.

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/ci.yml` with exactly:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck (project-wide)
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test (runtime + type-level)
        run: pnpm test
```

- [ ] **Step 3: Validate the workflow YAML**

Run:
```bash
pnpm dlx js-yaml .github/workflows/ci.yml > /dev/null && echo "yaml ok"
```
Expected: prints `yaml ok` (parses cleanly). If `js-yaml` is unavailable offline, instead confirm the file has no tab characters: `grep -nP "\t" .github/workflows/ci.yml || echo "no tabs"`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + lint + test gate (GitHub Actions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Final full-suite verification**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: all green. This is the same sequence CI runs; a clean local run means the WS0.5 harness is complete and the day-0 contracts are now executably pinned.

---

## Done criteria

- `pnpm test` runs runtime tests (`convex/seed.test.ts`, `convex/tools.test.ts`, `convex/lib/vapiReport.test.ts`, `tests/smoke.test.ts`) and type-level tests (`tests/contracts.test-d.ts`) and all pass.
- `pnpm typecheck` and `pnpm lint` are green.
- The VAPI end-of-call-report normalizer lives in one tested module, produces `EngineEndOfCallReport`, and the webhook uses it; the inline `mapEndOfCallReport` is gone.
- CI runs the harness on every push/PR.
- No frozen contract (`schema.ts`, `_contracts.ts`, `lib/types.ts`) was edited; any drift the harness surfaced was reported, not silently patched.

## Notes for the executor

- **If a conformance test fails because the *contract* is wrong (not the test):** STOP and surface it. The whole point of WS0.5 is to catch drift; changing a frozen contract is a cross-workstream decision, not an inline fix.
- **`convex-test` loads every module via `import.meta.glob("./**/*.ts")`.** If a future `"use node"` file is added, convex-test still handles it, but ensure no test file imports Node-only APIs.
- **After any schema or function signature change, re-run `pnpm convex dev` (or `pnpm convex codegen`) and commit `convex/_generated/`** — CI typecheck resolves `internal.*`/`api.*` against the committed generated files.
- **The `languages` field is intentionally `undefined`** out of the normalizer — VAPI does not reliably report per-call languages in the end-of-call report. If a later workstream derives language from `artifact.messages` or the transcriber config, extend `engineReportToRecordArgs` and add a fixture case.
```
