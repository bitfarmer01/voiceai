# Phase 3 — Make the Trace Real

Last updated: 2026-06-17
Branch: `phase3-make-the-trace-real` (off `main`)
Status: **complete — all 6 build steps + 5 adversarial-review fixes done; typecheck clean; 81 tests pass (was 55). Not yet committed.**

## Review fixes applied (adversarial pass)

1. **Ownership (major)** — `batchWriteSpans` / `recordTurns` / `recordQualityMetrics` now take `sessionId` and verify `call.sessionId === sessionId` before writing; the hook threads it via `start(assistant, callId, sessionId)`. (Note: the established app posture is callId-as-capability — `attachVapiId` has the same gap; left out of scope but worth a follow-up.)
2. **Tool result double-match (major)** — `deriveSpansFromEvents` consumes each tool-result at most once (a second call sharing a `toolCallId` falls back to zero-width).
3. **Metric clamping (major)** — `recordQualityMetrics` clamps talkRatio→[0,1], interruptions/deadAir/wpm→≥0 server-side.
4. **Stale flush timer (minor)** — `start()` calls `stopFlushTimer()` first so a leftover interval can't fire against a new callId.
5. **O(n²) upsert (minor)** — added `spans.by_trace_span` compound index; `batchWriteSpans` now does per-span point lookups instead of collecting the whole trace each flush.

## Problem

The app's signature feature — the per-call OTel trace waterfall — renders **empty on every real call**. The infrastructure is fully built (`batchWriteSpans`, `listByTrace`, `TraceWaterfall`), but nothing ever emits turn-level spans, and the only spans that exist (tool spans) are keyed to the wrong trace id. Two more surfaces are silently dead for the same root cause: the report's `CallTimeline` (no `transcriptTurns` write path) and `qualityMetrics` (never computed or rendered).

This phase wires up the **missing emission layer** so the trace, timeline, and quality metrics all populate from real calls.

## Verified findings (against the code)

- **GAP 1** — [lib/vapi/use-vapi-call.ts](../../../lib/vapi/use-vapi-call.ts) subscribes to all VAPI events but **never emits a span**.
- **GAP 2** — [convex/http.ts](../../../convex/http.ts) tool spans use `traceId: businessId` (3 sites); the report queries `listByTrace({ traceId: callId })`. Tool spans never appear.
- **GAP 3** — `calls.qualityMetrics` (talkRatio, interruptions, deadAirSec, wpm, sentiment) is schema-only; never computed or rendered.
- **GAP 4 (blocker, found by design panel)** — [convex/transcriptTurns.ts](../../../convex/transcriptTurns.ts) has only `listByCall`; **no write mutation anywhere**. The report `CallTimeline` is empty today, and `computeQualityMetrics(spans, turns)` would get nothing.
- `callId` **is** available at assistant-build time — [try/page.tsx](../../../app/(site)/try/page.tsx) calls `startCall` (returns callId) before `buildAssistant`. So `cid` can be encoded in the tool URL directly.
- `getByVapiId` exists ([calls.ts:206](../../../convex/calls.ts#L206)) — viable server-side fallback for tool-trace correlation.
- **Panel correction:** the panel claimed `convex/lib/vapiReport.ts` doesn't exist — it does, and parses `componentLatencyMs` from `message.artifact.performanceMetrics`. But that data is averages and "often absent" per the file's own comment, so client-derived per-turn spans remain the correct primary source. Do **not** rip out client derivation in favor of server latency later.

## Design decisions (locked, post-pressure-test)

1. **traceId = the Convex callId** for every span. Single trace key, matches the report query.
2. **Turn boundaries from transcript `role` + `transcriptType:'final'`** — NOT the global `speech-start/end` events (they carry no role; hard-coded to assistant in the hook). `stt`/`llm`/`tts` micro-spans are **labeled approximations**, honest under barge-in.
3. **Relative timestamps.** All spans stored as ms-relative-to-call-start. Client computes offsets from the `call-start` event (browser clock cancels out). Server tool spans compute `Date.now() − call.startedAt` (Convex clock). The small origin difference (media-connect vs row-create) is a documented approximation, consistent with #2.
4. **Periodic flush (~5s) + final flush** via `batchWriteSpans`; re-buffer on failure. Single-fire-at-call-end loses ~5–10% of calls to tab close / network. Still zero network on the audio render path (flush is on a timer, not per-event).
5. **Quality metrics computed client-side** at call-end from buffered turns+spans (server has no turns to recompute from — GAP 4). Deterministic four only: talkRatio, interruptions, deadAirSec, wpm. **Sentiment deferred** (needs a model call) — render as "—" / omitted.
6. **Live in-call trace panel: cut from v1.** Post-call report is authoritative. Only update the `/try` placeholder copy. Defer live panel to v1.1.
7. **Reuse**: `TraceWaterfall`, `CostBreakdown` (layout pattern for the metrics panel), `CallTimeline`, `EmptyState` (with action when metrics absent). No new primitives.

## Build order (TDD; pure functions first)

1. **transcriptTurns write** — `recordTurns` mutation (batch upsert by callId+idx). Persist from the hook on each final turn (or batched). convex-test coverage. *Unblocks timeline + metrics.*
2. **`deriveSpansFromEvents(events, callStartMs)` pure fn** (`lib/vapi/derive-spans.ts`) + vitest tests. Normalized events → `TraceSpan[]`, relative ms, turn/stt/llm/tts with `attrs.approx: true` on micro-spans.
3. **Wire `use-vapi-call.ts`** — capture `callStartMs` on `call-start`; buffer normalized events (role + final + ts) in a ref; expose turns; periodic + final flush via `batchWriteSpans`; persist turns via `recordTurns`. traceId = activeCallId.
4. **Tool spans become client-side** (revised — removes the panel's highest risk). The SDK default `clientMessages` delivers `tool-calls` but NOT results, so: add explicit `clientMessages` (incl. `tool-calls-result` + `tool.completed`) to the assistant config in [assistant.ts](../../../lib/vapi/assistant.ts); the hook normalizes call+result into `tool-call`/`tool-result` events; `deriveSpansFromEvents` pairs them by `toolCallId` (already built + tested) → tool spans land on `traceId === callId`, one clock. **Remove** the wrong-keyed server `emitToolSpan` writes from [http.ts](../../../convex/http.ts) (redundant + buggy). No `cid` URL threading, no silent-fallback failure mode.
5. **`batchWriteSpans` guard + idempotency** — add a `callId` arg; assert the call exists and skip any span whose `traceId !== callId`; **upsert by `(traceId, spanId)`** so the periodic + final flush don't duplicate. convex-test coverage.
6. **`computeQualityMetrics(turns, spans)` pure fn** + vitest tests; `recordQualityMetrics` mutation; **QualityMetrics panel** on [call-report-client.tsx](../../../app/(site)/calls/[id]/call-report-client.tsx) (CostBreakdown layout, EmptyState when absent, sentiment deferred).

## Highest risk

Tool-trace-key correlation fails **silently** — when `cid` is absent the span writes successfully to the wrong trace and vanishes from the waterfall with no error. Mitigate: `getByVapiId` fallback, `console.warn` on cid-absence, and an integration test asserting the tool span lands on `traceId === callId`.

## Verification

- `pnpm typecheck` clean.
- `pnpm test` — new pure-fn tests (deriveSpans, computeQualityMetrics) + convex-test (recordTurns, batchWriteSpans guard, tool-trace integration) green.
- Manual: drive a live `/try` call with the VAPI key, open `/calls/[id]`, confirm waterfall + timeline + metrics populate.

## Out of scope (v1.1+)

Live in-call trace panel; sentiment; reconciling client spans with VAPI `performanceMetrics` server-side; 2nd voice engine.
