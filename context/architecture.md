# Architecture

## Stack

| Layer                    | Tool                                              | Purpose                                              |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------- |
| Framework                | Next.js 16 (App Router, React 19)                 | Full-stack framework; SSR + RSC                      |
| Backend / DB / realtime  | Convex 1.41                                        | Schema, queries/mutations/actions, HTTP, scheduler   |
| Voice engine             | VAPI (`@vapi-ai/web` 2.5.2)                        | Realtime WebRTC call orchestration (STT/LLM/TTS)     |
| LLM (text + ingestion)   | NVIDIA NIM (via `@ai-sdk/openai`)                  | Chat twin + document/profile extraction              |
| Text-chat runtime        | Vercel AI SDK (`ai` 6, `@ai-sdk/react`)           | `streamText` + tools + `useChat`                     |
| Analytics                | PostHog (`posthog-js`)                            | Autocapture + named product events                   |
| Styling                  | Tailwind CSS v4 + shadcn-style primitives         | UI; `@theme` tokens (no `tailwind.config`)           |
| Icons                    | Phosphor (`@phosphor-icons/react`)                | Icon system (NOT lucide)                             |
| Charts                   | recharts                                          | `/analytics` + leaderboard bars                      |
| Language                 | TypeScript strict                                 | Throughout                                           |
| Deploy                   | Netlify (Node 22)                                 | SSR; manual CLI deploy onto the dev Convex backend   |

There is **no separate auth provider** — sessions are anonymous (a per-browser `visitorKey`).

---

## Folder Structure

```
/
├── AGENTS.md                        → Agent entry point: rules + pointer to context/
├── CLAUDE.md                        → @AGENTS.md
├── context/                         → THIS reference set (the single source of truth)
├── instrumentation-client.ts        → PostHog init (Next auto-loads on the client pre-hydration)
├── netlify.toml                     → Netlify build (pnpm build, NODE_VERSION=22)
├── app/
│   ├── layout.tsx                   → Root layout: fonts, metadata, <Providers>, <Toaster>
│   ├── globals.css                  → Signal Bold @theme tokens (light + dark)
│   ├── (site)/                      → Site route group (wrapped by ViewModeProvider)
│   │   ├── layout.tsx               → Site shell (header/footer) + ViewModeProvider
│   │   ├── page.tsx                 → Homepage → <TryExperience/>
│   │   ├── home/page.tsx            → Marketing landing
│   │   ├── try/page.tsx             → redirect("/")
│   │   ├── app/[slug]/              → Configured business demo (call + chat widget)
│   │   ├── setup/[slug]/            → Owner setup for a slug-based demo
│   │   ├── calls/page.tsx           → Recent calls feed
│   │   ├── calls/[id]/              → Post-call report (+ call-report-client.tsx)
│   │   ├── overview/page.tsx        → Owner KPI dashboard
│   │   ├── leaderboard/page.tsx     → Provider comparison (technical)
│   │   ├── evals/page.tsx           → Eval results (technical)
│   │   ├── analytics/page.tsx       → PostHog telemetry (technical)
│   │   └── admin/page.tsx           → Admin/audit (env-gated)
│   └── api/
│       ├── chat/route.ts            → Node runtime: Vercel AI SDK + NVIDIA NIM, 4 tools
│       └── ics/[leadId]/route.ts    → Node runtime: streams a booking .ics file
├── components/                      → UI only — no data fetching / no direct DB (see ui-registry.md)
├── lib/                             → Client/server glue + pure helpers
│   ├── vapi/                        → assistant builder, call hooks, span derivation
│   ├── chat/                        → AI SDK tools, system prompt, calculator
│   ├── calls/                       → booking / outcome / trace / quality-metrics helpers
│   ├── data/                        → presets + provider catalog + reactive data hooks
│   ├── hooks/                       → use-visitor-key, use-time-ago
│   ├── types.ts                     → Frozen domain vocab (mirrors convex enums)
│   ├── nav.ts                       → OWNER_NAV / TECHNICAL_NAV
│   ├── view-mode.tsx                → owner/technical store + <TechnicalOnly>
│   ├── format.ts · utils.ts · unknown.ts
└── convex/                          → Backend (see "Convex backend" below)
    ├── _contracts.ts                → FROZEN cross-seam contracts (tools, budget, engine adapter)
    ├── schema.ts                    → FROZEN table definitions
    ├── lib/                         → hours · bookingSlot · vapiWire · vapiReport · ingest_helpers
    └── *.ts                         → function modules (queries/mutations/actions/http)
```

---

## Route Map

**Pages** — see [project-overview.md](project-overview.md#pages). All under `app/(site)/`.

**API routes** (`app/api/`):

| Route                    | Runtime | What it does                                                                        |
| ------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `POST /api/chat`         | nodejs  | `streamText` against NVIDIA NIM with the 4 chat tools; `toUIMessageStreamResponse()`. `maxDuration = 30`. |
| `GET /api/ics/[leadId]`  | nodejs  | Reads a lead and returns an `.ics` calendar download for a booking confirmation.    |

VAPI also talks to the **Convex HTTP site** (`*.convex.site`), not Next.js — see "VAPI HTTP surface" below.

---

## System Boundaries

| Folder        | Owns                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------- |
| `app/`        | Pages + the two API routes. No business logic in route handlers.                              |
| `convex/`     | All backend: schema, data access, receptionist tools, telemetry sink, VAPI/HTTP surface.      |
| `components/` | UI only. No direct DB calls; data arrives via Convex hooks or props.                          |
| `lib/`        | Third-party client glue (VAPI, AI SDK, Convex http) + pure helpers. No JSX in `*.ts`.         |

---

## Convex Backend

### Schema (`convex/schema.ts` — FROZEN)

Field names and enums mirror `lib/types.ts` and `convex/_contracts.ts` exactly. **Every documented read path
has a matching index — no `.filter()` for WHERE clauses.** Additions must be `v.optional(...)`.

Shared enum validators: `callStatus` (`idle|connecting|live|ended`), `callOutcome`
(`booked|intent|abandoned`), `providerKind` (`stt|tts|llm`), `providerSource` (`native|custom`), `spanKind`
(`stt|llm|tts|tool|guardrail|turn`), `turnRole` (`user|assistant|system`), `evalStatus` (`pass|fail`).

| Table              | Key fields                                                                                                                                                                                  | Indexes                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `businesses`       | kind (`preset|upload|configured`), slug?, sessionId?, name, profile {companyName, hours, services[], policies[], availability, intakeQuestions?}, sourceMeta?, chunkCount?, createdAt, expiresAt?              | by_session, by_kind, by_expiresAt, by_slug                                       |
| `knowledgeChunks`  | businessId, text, tags[]                                                                                                                                                                     | by_business; **searchIndex** `search_text` (searchField `text`, filter `businessId`) |
| `calls`            | sessionId, businessId, businessName, vapiCallId?, status, outcome?, startedAt, endedAt?, durationSec, costUsd, costBreakdown {stt,llm,tts,platform}, sttProvider, ttsProvider, ttsVoice?, llmProvider, languages[], ttfwMs?, successEval?, summary?, structuredData?, qualityMetrics?, guardrailEvents?, visitorKey?, **channel?** (`voice|chat`), **concurrencyReleased?**, **costRecorded?** | by_vapiCallId, by_session, by_status, by_startedAt, by_business, by_visitor      |
| `spans`            | traceId (=== callId), spanId, parentId?, kind, label, startMs, endMs, durationMs, attrs?                                                                                                     | by_trace, by_trace_span (point-lookup for idempotent flush upsert)               |
| `logs`             | traceId, ts, level (`debug|info|warn|error`), msg, attrs?                                                                                                                                    | by_trace                                                                         |
| `transcriptTurns`  | callId, idx, role, text, ts, interim?, confidence?                                                                                                                                           | by_call                                                                          |
| `voiceRatings`     | callId, ttsProvider, ttsVoice?, stars, visitorKey?                                                                                                                                           | by_provider, by_call                                                             |
| `providerStats`    | provider, kind, source, voice?, p50LatencyMs, p95LatencyMs, costPerMin, avgRating, callCount, languages[]                                                                                    | by_kind, by_provider                                                             |
| `evalCases`        | name, businessId, script[{role,text}], expectations[]                                                                                                                                        | by_business                                                                      |
| `evalRuns`         | caseId, config {stt,tts,llm,businessId}, status, passed, score, latencyMs, groundingScore, transcript, createdAt                                                                             | by_case                                                                          |
| `budgetState`      | totalSpentUsd, daySpentUsd, day (YYYY-MM-DD), activeCalls  — **singleton**                                                                                                                   | (none)                                                                           |
| `visitorUsage`     | visitorKey, day, callsToday                                                                                                                                                                  | by_visitor_day                                                                   |
| `leads`            | callId, businessId, contact, request, createdAt                                                                                                                                             | by_call, by_business                                                             |
| `appointments`     | businessId, date (`YYYY-MM-DD`), time (`HH:mm`), source (`sample\|booked`), leadId?, service?, customerFirstName? — one row per TAKEN 30-min slot; open slots = the hours grid minus these rows | by_business_date, by_business_slot, by_date                                      |

### Function modules

Public surface = `api.*`; internal-only = `internal.*`. **`"use node"`** modules run in the Node runtime
(can do network IO / DNS); all others run in the V8 runtime.

| Module                    | Runtime | Key exports / purpose                                                                                  |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `calls.ts`                | V8      | `startCall` (race-checked guard + "live" row + concurrency inc + calendar top-up), `getById` (PII-stripped, visitorKey-gated), `listRecentAnonymized` (excludes `channel:"chat"`), `recordEndOfCall` (internal; cost/outcome), `patchUsedChunks`, `patchOfferedSlots` (internal; writes the 2 just-offered slots onto the live voice call's `structuredData.offeredSlots`) |
| `lifecycle.ts`            | V8      | `endCall` — idempotent client teardown; releases concurrency once, sets `status:"ended"`               |
| `guard.ts`                | V8      | `canStartCall` — pre-check returning `{allowed, reason, budget, visitor}` (mirrors `_contracts`)        |
| `budget.ts`               | V8      | `getPublicState`; idempotent `recordCostOnce` / `releaseConcurrencyOnce` helpers                       |
| `tools.ts`                | V8      | FROZEN receptionist tools: `lookupKnowledge` (internalQuery); `checkAvailability` (internalQuery) — the 2 soonest open `"YYYY-MM-DD HH:mm"` slots (hours grid minus the `appointments` calendar); `bookAppointment` (internalMutation) — requires a concrete time, atomically claims the slot in the same mutation as the lead, rejects an already-taken slot with 2 alternatives |
| `chat.ts`                 | V8      | PUBLIC chat wrappers over `internal.tools.*`; `bookAppointment` find-or-creates a `channel:"chat"` anchor and validates the slot directly (does NOT delegate booking — the frozen tool would mis-attach to a live voice call) |
| `calendar.ts`              | V8      | The sample-calendar module shared by `tools.ts` + `chat.ts`: `slotKey`/`loadTaken`/`isSlotTaken`/`insertBookedAppointment`/`takenMessage` (plain helpers), `seedCalendar`/`resetSampleCalendar` (idempotent top-up), `ensureSeeded` (internalMutation wrapper), `rollForward` (internalMutation; the cron target — prunes past `sample` rows, tops up every non-expired business), `getWindow` (public query — the reactive grid `<AvailabilityCalendar>` subscribes to) |
| `http.ts`                 | V8      | The VAPI HTTP surface (`/vapi/webhook` + `/tools/*`) — see below                                       |
| `businesses.ts`           | V8      | `listPresets`, `getWithChunks` (nested `{_id, name, profile, chunks}`), `getBySlug`, upload-url + `insertUploadedBusiness` (internal) |
| `knowledgeChunks.ts`      | V8      | `listForBusiness`                                                                                       |
| `sources.ts`              | **Node**| `generateDraftProfile` (no insert), `createBusinessFromProfile` (sanitize → insert), `suggestField`, `extractAndInsert` helper |
| `ingest.ts`               | **Node**| `ingestText`, `ingestUrl` (SSRF-checked fetch + htmlToText), `ingestDocument` (OCR images) → all → `extractAndInsert` |
| `telemetry.ts`            | V8      | `batchWriteSpans` — OTel span sink (idempotent upsert by traceId+spanId)                               |
| `spans.ts`                | V8      | `listByTrace`                                                                                          |
| `transcriptTurns.ts`      | V8      | `listByCall`, `recordMany`                                                                             |
| `ownerStats.ts`           | V8      | `summary` — owner KPIs, real data only                                                                 |
| `providerStats.ts`        | V8      | `listByKind` (leaderboard)                                                                             |
| `providers.ts`            | V8      | `listSelectable` — mix-and-match pipeline options                                                      |
| `voiceRatings.ts`         | V8      | `rate`                                                                                                 |
| `leads.ts`                | V8      | `getById` (for the `.ics` route)                                                                       |
| `crons.ts`                 | V8      | `cronJobs()` — daily 00:05 UTC → `internal.calendar.rollForward`                                        |
| `seed.ts` / `seedPresets.ts` | V8   | `seed` — real-data-only (presets + zeroed budget; clear-then-insert, destructive)                     |
| `schema.ts` · `_contracts.ts` | —   | FROZEN definitions (no functions)                                                                     |

`convex/lib/`: `hours.ts` (free-text hours → weekly schedule; `parseHours/isOpenOn/isWithinHours/slotsFor/...`),
`bookingSlot.ts` (`validateSlot(hours, slot, now)` — shared by `tools.ts` + `chat.ts`), `vapiWire.ts`
(server webhook envelope parsing: `unwrapMessage/extractToolCalls/asString/asNumber`), `vapiReport.ts`
(`normalizeVapiEndOfCallReport` → engine-agnostic report), **`ingest_helpers.ts` (`"use node"`)**
(`sanitizeProfile`, `buildExtractionPrompt`, `htmlToText`, `assertSafeUrl`, draft/suggest prompt builders),
`intake.ts` (`validateIntake` — clamps a drafted per-service question set to 1–3 questions of 2–4 options each,
dropping unknown services; `intakeFor`, the single-question `GENERIC_INTAKE` fallback), `calendarSeed.ts`
(`sampleSlots`/`dayGrid`/`hash32` — deterministic ~`SAMPLE_BOOKED_PCT`% sample density over `CALENDAR_DAYS`=14; pure,
clock-free), `availability.ts` (`nextOpenSlots` — the shared open-slot search behind both `check_availability` and
the taken-slot rejection message).

### VAPI HTTP surface (`convex/http.ts`)

Served from the Convex **site** URL (`${NEXT_PUBLIC_CONVEX_SITE_URL}/...`). Principles: the webhook
**verifies `X-Vapi-Secret`, ACKs 200 immediately, and schedules** heavy work; the tool endpoints
**"respond first, log after"**.

```
POST /vapi/webhook            → verify secret → switch(type):
                                  end-of-call-report → schedule internal.calls.recordEndOfCall
                                  status-update / tool-calls / * → ack 200
POST /tools/lookup_knowledge  → internal.tools.lookupKnowledge   → { results: [{ toolCallId, result }] }
POST /tools/check_availability→ internal.tools.checkAvailability → { results: [...] }
POST /tools/book_appointment  → internal.tools.bookAppointment   → { results: [...] }
```

The secret accepted is `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (the transient assistant is built client-side, so its
`server.secret` must be client-safe) **or** `VAPI_PRIVATE_KEY` (server-initiated calls).

---

## Data Flow

### Voice call

```
/try (use-try-call.ts)
   → guard.canStartCall (pre-check budget/concurrency)
   → calls.startCall (race-re-check + insert "live" row + activeCalls++ + calendar top-up via seedCalendar)
   → buildAssistant / buildAssistantFromConvexBusiness  (system prompt + 3 tools + endCall)
   → VAPI Web SDK starts the WebRTC call
   ── mid-call ──
   → STT / LLM / TTS; tool calls hit ${CONVEX_SITE_URL}/tools/* → internal.tools.* (respond first)
   → client derives OTel spans from SDK messages → telemetry.batchWriteSpans (flush every ~5s + on end)
   ── end ──
   → End button / verbal hang-up → lifecycle.endCall (idempotent)  AND/OR
   → VAPI POSTs /vapi/webhook end-of-call-report → schedules calls.recordEndOfCall (cost + outcome)
   → /calls/[id] reads calls.getById (visitorKey-gated) + spans.listByTrace + transcriptTurns.listByCall
```

### Text chat (`/app/[slug]`)

```
receptionist-chat.tsx (useChat) → POST /api/chat
   → buildChatSystemPrompt + buildChatTools({businessId, sessionId})  → streamText(NVIDIA NIM)
   → tools: calculator (pure) | lookupKnowledge/checkAvailability/bookAppointment → ConvexHttpClient → convex/chat.ts
   → bookAppointment: find-or-create channel:"chat" calls anchor, validateSlot, write lead + structuredData
   → stream back → AppointmentCard rendered inline
```

### Ingestion (BYOD)

```
paste / upload / URL → convex/{sources,ingest}.ts ("use node")
   → (fetch + htmlToText | OCR | trim) → extractAndInsert
   → NIM extraction → sanitizeProfile → businesses + knowledgeChunks  → businessId
```

### Booking → appointment card → .ics

```
check_availability → nextOpenSlots (convex/lib/availability.ts) over dayGrid minus loadTaken (convex/calendar.ts)
   → 2 soonest open "YYYY-MM-DD HH:mm" slots; voice best-effort mirrors them onto the live call via
     calls.patchOfferedSlots → structuredData.offeredSlots (chat reads its own latest tool result instead)
book_appointment (voice tool or chat) → validateSlot (convex/lib/bookingSlot.ts against parsed hours)
   → isSlotTaken (by_business_slot) — taken → booked:false + 2 alternatives (takenMessage), nothing persisted
   → write leads row + insertBookedAppointment in the SAME mutation (serializable transaction → no double-book)
     + patch calls.structuredData
   → /try + report subscribe to calls.getById → <AppointmentCard> renders live
   → GET /api/ics/[leadId] → leads.getById → .ics download
```

---

## Environment Variables

| Variable                      | Exposed? | Used in                                                            |
| ----------------------------- | -------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`      | client   | Convex React/HTTP client; chat tools                              |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | client   | Builds the VAPI webhook + tool base URL (`*.convex.site`)         |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | client   | `@vapi-ai/web` SDK; webhook shared-secret (primary)               |
| `VAPI_PRIVATE_KEY`            | server   | Webhook secret verification fallback (`convex/http.ts`)           |
| `NVIDIA_NIM_API_KEY`          | server   | `/api/chat` (NIM chat) + `convex/sources.ts`/`ingest.ts` (extraction) |
| `CHAT_MODEL`                  | server   | NIM model id (default `NIM_TEXT_MODEL` in `convex/lib/nim.ts`)           |
| `NEXT_PUBLIC_POSTHOG_KEY`     | client   | `instrumentation-client.ts` (analytics; no-op if unset)           |
| `NEXT_PUBLIC_POSTHOG_HOST`    | client   | PostHog ingestion host (default `https://us.i.posthog.com`)       |
| `NEXT_PUBLIC_ADMIN_ENABLED`   | client   | Gates `/admin`                                                    |

`NEXT_PUBLIC_*` is inlined at build time — set it in the Netlify site env, not just `.env.local`. Never put a
secret behind a `NEXT_PUBLIC_` prefix.

---

## Auth & Session Identity

**No user auth.** Identity is anonymous and per-browser:

- `visitorKey` — `crypto.randomUUID()` via `useVisitorKey` (`lib/hooks/use-visitor-key.ts`), persisted in
  `localStorage`. Stamped onto every `calls` row at `startCall`.
- `sessionId` — passed client→server; scopes uploaded businesses and the chat anchor.
- `calls.getById` is **gated on `visitorKey`** → a third party opening a shared `/calls/[id]` link gets `null`
  ("Call not found"). The report page is therefore owner-only.
- `/admin` is gated by the `NEXT_PUBLIC_ADMIN_ENABLED` env flag (not real auth). The `ViewModeProvider` wraps
  the `(site)` subtree only, so `/admin` has no view-mode context — don't use those hooks there.

---

## Invariants

Rules the agent must never violate:

- **FROZEN contracts** — `convex/schema.ts`, `convex/_contracts.ts`, and `lib/types.ts` mirror each other.
  Changing a field/enum is a breaking change to every workstream. Additions are `v.optional(...)`.
  `_contracts.ts` has **zero side effects** and must never import `./_generated/*`.
- Every documented read path has an **index** — never `.filter()` for a WHERE clause.
- `components/` never calls the DB directly; `convex/` never imports from `components/`.
- The receptionist always answers from business data only; tool responses degrade open with a transparent note
  rather than failing (free-text hours that won't parse → offer to take a message, never invent).
- **Booking is idempotent** (`idempotencyKey`); a chat booking writes to its own `channel:"chat"` anchor and is
  excluded from `listRecentAnonymized` + `ownerStats.summary`.
- **Split-brain call finalization** — `endCall` (client) and `recordEndOfCall` (webhook) can fire in any order;
  the `concurrencyReleased` / `costRecorded` markers guarantee each side effect happens **exactly once**.
- **`"use node"` vs V8** — `convex/lib/ingest_helpers.ts` is Node-only (uses `node:dns`). Only `sources.ts`
  and `ingest.ts` (also `"use node"`) may import it; a V8 query/mutation importing it breaks `convex codegen`.
- **Per-request `ConvexHttpClient`** — `lib/chat/tools.ts` lazily memoizes one client per request (built on the
  first Convex-backed tool call), so the calculator-only path and unit tests never construct one.
- **The `@/`-alias-under-vitest gotcha** — see [code-standards.md](code-standards.md). Value imports of
  `@/convex/_generated/api` or `@/convex/_contracts` fail in any file a test imports; use a relative path there.
- **Slot keys are UTC face-value wall-clock** — `"YYYY-MM-DD HH:mm"` (`convex/calendar.ts` `slotKey`), the same
  convention as `parseSlot`/`isPastSlot`; "today" is the UTC date of `Date.now()`. At most one `appointments` row
  exists per (`businessId`, `date`, `time`), enforced inside the inserting mutation.
- **Sample rows are pruned, booked rows never are** — the daily cron (`calendar.rollForward`) deletes past
  `source:"sample"` rows; a `source:"booked"` row is permanent history and is never deleted by any calendar code.
- **Calendar PII** — a first name (`customerFirstName`) is stored on every booked row but is only ever returned to
  the client when `highlightLeadId` matches that row's `leadId` (the viewer's own booking). There's no auth, so
  this is the only thing standing between one caller and another caller's name.
