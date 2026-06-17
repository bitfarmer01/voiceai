# Memory — Phase 3 "Make the Trace Real" (committed, PR open)

Last updated: 2026-06-17

## What was built

**Phase 3 (branch `phase3-make-the-trace-real`, off `main`, committed + pushed, PR to `main` open):**

The signature trace waterfall rendered empty on every real call — span emission was never wired up. Phase 3 adds the missing layer so the report waterfall, transcript timeline, and quality metrics all populate. Plan: `docs/superpowers/plans/2026-06-17-phase3-make-the-trace-real.md`.

- **`lib/vapi/derive-spans.ts`** (+ test) — pure: normalized VAPI events → `TraceSpan[]`, relative-to-call-start. Turn boundaries from transcript `role`+`final`; stt/llm/tts are labeled approximations (`attrs.approx`). Tool spans from client tool-call/result, each result consumed once.
- **`lib/calls/quality-metrics.ts`** (+ test) — pure: turns+spans → {talkRatio, interruptions, deadAirSec, wpm}. Sentiment deferred.
- **`lib/vapi/use-vapi-call.ts`** — buffers normalized events; on call-start captures callStartMs + starts a 5s flush timer; `flush()` derives+persists spans (`batchWriteSpans`), finalized turns (`recordTurns`), and on final flush computes+persists metrics (`recordQualityMetrics`). `start(assistant, callId, sessionId)`.
- **`lib/vapi/assistant.ts`** — adds `clientMessages` (incl. `tool-calls-result`/`tool.completed`) so the client receives tool results.
- **`convex/telemetry.ts`** — `batchWriteSpans({callId, sessionId, spans})`: guards call-exists + sessionId-owns + traceId===callId; upserts via `by_trace_span` index. `writeSpanInternal` removed.
- **`convex/transcriptTurns.ts`** — `recordTurns` upsert by (callId, idx), sessionId-guarded; `listByCall` now maps to clean shape (was returning system fields → latent bug exposed once turns existed).
- **`convex/spans.ts`** — `listByTrace` maps to clean shape (same latent validator bug).
- **`convex/calls.ts`** — `recordQualityMetrics` (sessionId-guarded, clamps ranges).
- **`convex/http.ts`** — removed 3 server-side `emitToolSpan` calls (tool spans now client-side; old ones mis-keyed to businessId).
- **`convex/schema.ts`** — `qualityMetrics.sentiment` optional; `spans.by_trace_span` compound index.
- **`components/shared/quality-metrics.tsx`** + report panel in `call-report-client.tsx`.

## Decisions made

- **Client is the single source of truth for the trace** — one clock (browser), relative-to-call-start ms, so no browser/server clock skew. This let me delete the risky server-side tool-span path (panel's highest risk) entirely.
- **traceId = the Convex callId** everywhere (matches the report query).
- **sessionId as ownership proof** — per-session secret, not in any URL. Note: `attachVapiId` has the same no-ownership-check gap (callId-as-capability is the app's established posture) — left out of scope.
- **Latent return-validator bug** — `listByCall`/`listByTrace` declared clean validators but returned full docs; never fired because no turns/spans ever existed (GAP 4). Fixed by mapping.
- **VAPI default clientMessages omit tool results** — had to set `clientMessages` explicitly.

## Current state

- **Branch `phase3-make-the-trace-real`:** all 6 build steps + 5 adversarial-review fixes done. **`pnpm typecheck` clean; 81 tests pass (was 55).** Committed + pushed; PR to `main` open.
- The Phase 3 commit also lands the **Phase 2 dependency fix** (`mammoth`, `pdf-parse`, `ai`, `@ai-sdk/openai`, `zod`, `@types/pdf-parse`): committed `convex/ingest.ts` imported these but the deps were never added to `package.json`/`pnpm-lock.yaml` when Phase 2 merged — so `main` was install-broken until this commit.
- Two design pressure-tests run via Workflow (pre-build design panel + post-build adversarial review); both findings folded in.
- VAPI API key present in `.env.local` (live calls possible).

## Next session starts with

1. **Manual verify**: drive a live `/try` call with the VAPI key, open `/calls/[id]`, confirm waterfall + timeline + Call-quality panel populate. This is the one thing tests can't cover (VAPI event shapes are defensive `TODO(vapi-shape)`).
2. Review + merge the Phase 3 PR to `main`.

## Open questions

- **VAPI client message shapes** — `toolEventsFrom` in the hook is defensive (`TODO(vapi-shape)`); confirm against a real call that tool spans get non-zero durations.
- **Sentiment** — deferred (needs a model call); panel renders "coming soon".
- **`attachVapiId` ownership gap** — pre-existing; revisit if hardening the whole surface.
- **Commercial vs portfolio** — still unfinalized (affects hosting).
