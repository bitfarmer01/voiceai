# Memory — Signal Bold UI + BYOD/appointment + Phase 3 telemetry

Last updated: 2026-06-20 (deployed to Netlify via CLI — **LIVE at voiceai-receptionist.netlify.app**, on the dev Convex backend) · Branch: `feature/owner-reposition`

> ⚠️ **Repo state (post-consolidation, 2026-06-19) — the old "uncommitted streams" gotchas are GONE:**
> 1. **One branch is the source of truth:** `feature/owner-reposition` (local + `origin` in sync at `cd093d9`).
>    EVERYTHING is committed — all prior uncommitted streams (Signal Bold UI, BYOD, call-end fix, dummy-data
>    cleanup, leaderboard, APoSD remediation, owner-reposition, receptionist fix) are in its history.
> 2. **`main` is KEPT but BEHIND** at `7cf732e` — it does NOT have the consolidated work. **Next housekeeping
>    step:** fast-forward `main` to `feature/owner-reposition` OR set the feature branch as the GitHub default.
> 3. **All other branches were DELETED (local + remote):** `feature/byod-and-signal-bold-ui`, `feature/byod-try-page`,
>    `phase1/2/3-*`, `worktree-agent-*`, `worktree-ws0.5-*`, `ws1-ui-feature-build`. Tips recoverable from local
>    reflog ~90d (e.g. `byod-try-page` `ad276b0`, `phase3` `1e62781`, `ws1` `1331dcd`); remote copies are gone.
> 4. **Convex:** dev DB was re-seeded CLEAN (presets only, zero fabricated calls/stats/budget). Keep `convex dev`
>    running; the consolidated commit includes Phase-3 telemetry so the dev deploy is not regressed.

## Deployed to Netlify via CLI (2026-06-20) — LIVE on the dev backend

User reported "not deploying on netlify correctly," then pivoted to "deploy via the Netlify CLI." Deployed
end-to-end with the CLI (pnpm-only). **LIVE: https://voiceai-receptionist.netlify.app** (Netlify project
`voiceai-receptionist`, team `rajath-zstbeqs`, Site/Project ID `cb688c46-58d9-456f-a78f-101ff5f9f039`).

**Likely original failure cause:** Next 16 needs Node ≥ 20.9, but Netlify's default build image is Node 18 →
build fails. Fix = pin `NODE_VERSION = "22"` in `netlify.toml`.

**What shipped (deploy IS done; app loads + is wired to the backend):**
- **NEW `netlify.toml`** (committed LOCALLY only — see git note): `[build] command = "pnpm build"` +
  `[build.environment] NODE_VERSION = "22"`. NO `@netlify/plugin-nextjs` block (Netlify auto-installs the Next
  runtime; a manual block conflicts). App is SSR — one dynamic server fn (`/api/ics/[leadId]`) + pages; no
  middleware, no edge runtime, no static export → clean fit for the Netlify Next runtime.
- **Backend = EXISTING Convex DEV deployment `notable-wildcat-778`** (NOT prod — see decision). The build does
  NOT run `convex deploy`; the frontend just points at the live dev backend via env. Confirmed the dev convex
  URL is baked into the client JS bundle.
- **Netlify site env vars** (set via CLI, no secrets stored in memory): `NEXT_PUBLIC_CONVEX_URL` =
  `https://notable-wildcat-778.convex.cloud`, `NEXT_PUBLIC_CONVEX_SITE_URL` =
  `https://notable-wildcat-778.convex.site`, `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (sourced from `.env.local`).
- **Deploy was MANUAL CLI:** `netlify deploy --build --prod` (builds locally, uploads). **Continuous deploy is
  NOT wired** (`netlify init` never run). Redeploy after code changes with
  `pnpm --package=netlify-cli dlx netlify deploy --build --prod`.

**Decisions:**
- **Dev backend over prod, for speed.** User originally chose prod Convex + continuous GitHub deploy (via
  AskUserQuestion), but couldn't produce a `prod:` deploy key — the dashboard yielded a `preview:` key, then a
  `dev:` key (for a different/empty deployment `ardent-fox-814`). Rather than churn, pivoted to pointing at the
  already-seeded dev backend (no key needed). Prod upgrade deferred.
- **CLI install method:** `pnpm --package=netlify-cli dlx netlify <cmd>` (netlify-cli 26.1.0). NO global install
  (`pnpm add -g` failed: PNPM_HOME unset; avoided `pnpm setup`, which edits the shell profile). Auth persists in
  `~/Library/Preferences/netlify`, link state in `.netlify/state.json`, so dlx works across commands.

**Gotchas:**
- **zsh does NOT word-split a quoted command var** (`NTL="pnpm … netlify"; $NTL x` → "command not found"). Use a
  function inside a single Bash call: `ntl(){ pnpm --package=netlify-cli dlx netlify "$@"; }`.
- **`curl` and `head` are NOT on the sandbox Bash PATH** — verify HTTP with `node -e` + global `fetch`.
- `login` / `sites:create --account-slug rajath-zstbeqs` / `link --name` ran non-interactively; only
  `netlify init` (GitHub continuous-deploy OAuth) is truly browser-interactive (so it was skipped).

**Verified:** `/`, `/try`, `/calls` → HTTP 200; title "The receptionist that never misses a call"; convex dev
URL present in a client chunk. **NOT verified (needs a human mic):** a real voice call on the deployed `/try`
(webhook → `notable-wildcat-778.convex.site/vapi/webhook`).

**Git:** `netlify.toml` + `.gitignore` (CLI added `.netlify/`) committed LOCALLY as `e613444` on
`feature/owner-reposition` (ahead of origin by 1, **NOT pushed**). Push it before wiring continuous deploy.

**SECURITY follow-up:** the user pasted a `preview:` and a `dev:` Convex deploy key into the chat — credentials
now in conversation history. Recommend rotating/revoking them in the Convex dashboard. (None were written to any file.)

**Next session / open items:**
1. (Optional) **Continuous deploy:** `netlify init` to connect `bitfarmer01/voiceai` (browser OAuth); set
   production branch = `feature/owner-reposition` (main is behind). Push `e613444` first.
2. (Optional) **Upgrade to prod Convex:** generate a `prod:` deploy key → set `CONVEX_DEPLOY_KEY` on Netlify →
   switch netlify.toml build to `pnpm exec convex deploy --cmd 'pnpm build'` (then drop the manual
   `NEXT_PUBLIC_CONVEX_URL`; Convex injects it) → set Convex PROD env (`NVIDIA_NIM_API_KEY`, `VAPI_PRIVATE_KEY`,
   `NEXT_PUBLIC_VAPI_PUBLIC_KEY`) → seed prod presets (`convex run seed:seed`).
3. **Live voice-call smoke test** on the deployed URL (still pending; needs a human).
4. The live site depends on the dev Convex deployment `notable-wildcat-778` staying active.

## `/try` rebuilt into a guided, opinionated journey (2026-06-19, UNCOMMITTED)

Replaced the flat 3-column `/try` (whose "My business" tab dumped users into 4 cold equal tabs —
Upload/Paste/Link/Form) with a **guided stage machine**. Brainstormed via the visual companion (mockups in
`.superpowers/brainstorm/54037-*/content/`); spec/plan `~/.claude/plans/i-want-to-refine-wobbly-hoare.md`.
Built by me + a `convex-expert` subagent (backend), live-verified with Playwright.

**Journey (`app/(site)/try/page.tsx` is now a thin machine):** `entry` → `demo-call` (Glow Dental) →
`demo-recap` → `form` → `your-call` → `your-recap`. Entry fork = "Hear a quick demo" / "Build my
receptionist". The finished-call recap is **derived during render** from `call.status==="ended"` (NOT a
setState-in-effect — that lint rule bit me; deriving also makes "call again" just work).

**New files:** `components/try/stages/{entry-fork,call-stage,guided-form,other-ways,recap}.tsx` +
`lib/vapi/use-try-call.ts` (owns ALL call orchestration: `useVapiCall` + startCall/attach/end + booking
subscription + `beginDemo`/`beginBusiness`; stages are presentational). **Deleted** orphaned
`components/try/business-form.tsx`. **Reused as-is:** `AgentStage` (already had live `VoiceVisualizer` +
calm ended-disc — craft-sweep Stream 3 was already done/committed), `CallController`, `AppointmentCard`,
guard/budget panels, `ConsentDialog`, `<TechnicalOnly>`.

**The smart guided form (centerpiece) — fields chosen by working backwards from the VAPI assistant input
(`buildAssistantFromConvexBusiness` consumes `{companyName,hours,services[],policies[],availability}`+chunks;
`services` feeds the prompt AND the check_availability/book_appointment tools):** owner supplies only
**name + business type + services (≤5)**; the LLM drafts hours/policies/availability/FAQ; owner reviews/edits
(services chips, hours, how-you-book) before anything is stored. Two assists: a **"Draft my receptionist"**
button + **5s-idle** live suggestions (ghost-text for type, Tab-accept; tap-to-add chips for services).
"Other ways →" disclosure reuses paste/upload/link → `getWithChunks` → call (no review step).

**Backend (`convex/sources.ts`, all `"use node"`; `convex/lib/ingest_helpers.ts`, TDD 92/92):**
- `generateDraftProfile` — `{companyName,businessType,services[]}` → full profile, **does NOT insert**.
- `createBusinessFromProfile` — sanitize the owner-edited profile → `ctx.runMutation(internal.businesses.insertUploadedBusiness)`.
  ⚠️ Built as a **`"use node"` action in sources.ts**, NOT a mutation in businesses.ts — `sanitizeProfile`
  lives in the `"use node"` `ingest_helpers.ts` and a V8 mutation can't import it. `businesses.ts` untouched.
- `suggestField` — lightweight; `{suggestion?}|{suggestions?}`; returns `{}` on any failure (never breaks the form).
- helpers: `buildFormDraftPrompt`, `clampDraftInput` (cap services 5), `buildSuggestPrompt`.

**Call screen:** clean single-focus; a **local "Show details" toggle** reveals slim insights (spending +
neutral `ShieldCheck` reassurance chips). The deep lab (`PipelineSelector`) stays behind the **global
Technical mode** (`<TechnicalOnly>`) — two distinct toggles, not redundant.

**Verified:** `pnpm typecheck` 0 · `pnpm test` **258/258** · lint = baseline (the 2 setState-in-effect errors
I introduced were fixed; remaining ~12 are pre-existing). **LIVE Playwright smoke (localhost:3000, real VAPI
calls, 0 console errors):** build branch — ghost "Dental clinic" (Tab), service chips, draft preserved+expanded
services + drafted hours/booking, create → live call greeting "Thanks for calling Lakeside Dental" → recap with
real `/calls/<id>` link; demo branch — Glow Dental greeting; Show-details slim insights; light + dark.
**Status: UNCOMMITTED** (new `stages/` + `use-try-call.ts` untracked; `page.tsx`/`agent-stage`/`call-controller`/
`sources.ts`/`ingest_helpers.ts` modified; `business-form.tsx` deleted).

## Receptionist behavior fix + repo consolidation (2026-06-19, COMMITTED)

Ran `/review` on receptionist BEHAVIOR (not UI) for 3 reported symptoms — **topic relevance, schedule/calendar
adherence, accuracy** — found 11 findings, then "comprehensively fixed all" via a 2-stream Workflow + an
adversarial probe + my integration. Then consolidated the whole repo.

**Root cause of the schedule bug:** business hours were **free text, never parsed**. So `check_availability`
returned fixed fictional slots (only Sunday hardcoded closed) and `book_appointment` validated NOTHING (booked
any slot verbatim — closed days, past dates, outside hours).

**What was built (committed in `c3d89fa`, the cleanly-separable core):**
- **NEW `convex/lib/hours.ts`** — pure V8-safe parser: free-text weekly hours → `{0..6 → {openMin,closeMin}|null}`.
  Exports `parseHours / isOpenOn / isWithinHours / slotsFor / describeDay / parseTimeToken / toHHMM`. Handles day
  RANGES (`-`/`to`), LISTS (`and`/`&`/comma via a pending-day buffer), am/pm + 24h times, "by appointment"
  (modality, not closure), `24/7`. Returns `null` → callers **degrade-open with a transparent note** (BYOD never
  worse). NEW `convex/lib/hours.test.ts` (40 cases, all 3 presets in am/pm + 24h).
- **`convex/tools.ts` rewrite** — `checkAvailability` = real open/closed days + slots within the actual window;
  `bookAppointment` = rejects past/closed-day/outside-window slots (persists NOTHING), books only valid ones.
  FROZEN `_contracts.ts` shapes UNCHANGED (reject via `booked:false`+message). `convex/tools.test.ts` extended.

**What was built (verified + committed in the consolidation `cd093d9`, NOT in `c3d89fa` — see below):**
- **`lib/vapi/assistant.ts` prompt + `app/(site)/try/page.tsx` wiring** — date anchor ("Today is …", passed from
  `/try`), check-availability-before-book rule, `lookup_knowledge` grounding instruction, scoped refusal naming
  the business, **temperature 0.4 → 0.2**, and `SITE_URL || window.location.origin` tool-URL fallback (+ honest
  localhost warn). NEW `lib/vapi/assistant.test.ts` asserts these prompt invariants.

**Problems solved this session:**
- **Adversarial probe caught 5 real bugs MY fix introduced** (a workflow Verify phase): "Monday to Friday" parsed
  as only Monday (critical), am/pm slot times without a colon silently dropped (bypassed the hours check),
  same-day date-only bookings wrongly rejected as past, `and`/`&`/comma day lists, and `24/7`. **All patched** in
  `hours.ts`/`tools.ts` + regression tests. Lesson: free-text hour parsing needs an adversarial pass.
- **Concurrent-session collision:** another session's APoSD F3/F5 refactor (`assembleAssistant` + nested business
  `profile`) edited `lib/vapi/assistant.ts`/`try/page.tsx` at the same time. My prompt changes SURVIVED; I only had
  to update my test's mock `biz` from flat → nested `profile`. Their `matchQuery`/`async-section.tsx` (P7) briefly
  broke the vitest typecheck mid-edit, then went green.

**Consolidation (done this session, COMMIT `cd093d9`):** committed the ENTIRE working tree (APoSD batch + my
prompt/wiring fixes, 49 files) onto `feature/owner-reposition`, pushed it, then **deleted all 8 other local
branches and the 6 remote ones** (see gotcha #2-#3 above). `.superpowers/` scratch left untracked.

**Current state:** `pnpm typecheck` clean · **237/237 tests** · everything committed. The receptionist now
validates against real hours and the prompt is hardened.

**Next session starts with — THE one open verification:** a **live `/try` voice call** to confirm end-to-end the
model actually (a) respects hours when offering/booking, (b) stays on topic, (c) grounds answers. Logic + prompt
are test-verified, but model behavior on a real WebRTC call is NOT automatable — needs a human mic test. Try
booking a closed-day/after-hours slot and asking an off-topic question. (Also pending from prior: live booking
that triggers `book_appointment` to confirm the appointment card renders mid-call.)

**Open questions:** (1) finish branch housekeeping — fast-forward `main` or set the feature branch as GitHub
default? (2) structured-hours-at-ingest (parse once into a schema field) instead of parse-on-read — a follow-up,
not blocking. (3) comma day-lists with BARE hours like "9-5" (no am/pm) still degrade-open (ambiguous) — fine.

## APoSD design audit + first remediation batch (2026-06-18, uncommitted)

Ran a strategic "A Philosophy of Software Design" audit over the whole app (backend call-pipeline read
directly; presentation layer via 4 parallel subagents against the red-flag catalog), then EXECUTED the 5
highest-value findings (2 carry real bugs) via subagents + integration. ✅ `pnpm typecheck` 0 errors ·
**180/180 tests** (was 169; +6 F2 + 5 timeAgo) · **0 NEW lint** (12 pre-existing remain; every touched file
is lint-clean). Full audit report (backend F1–F9 + presentation P1–P9 + combined plan) is in this session's
transcript. NOTE: `convex codegen` during verification did a dev push of the local functions — harmless (the
working tree already includes Phase-3 telemetry, so the dev deploy is not regressed).

**The audit CORRECTED 3 stale assumptions in this file / the craft-sweep plan (verified by reading files):**
- The shadcn `ring-1 ring-foreground/10` depth tell is ALREADY gone everywhere (card/select/dialog/dropdown/
  popover/sheet all use `border border-border` + shadow). Craft-sweep **Stream 2 is effectively DONE — do not redo.**
- `cost-breakdown.tsx` does NOT misuse the latency scale (it's correctly neutral `bg-foreground/20·35·50·65`).
  The cost honesty-flag is resolved. The real latency-token misuse was in `trace-waterfall.tsx` (fixed, P6).
- `trace-waterfall.tsx`'s TTFW number/color (line ~84) is already correct — the old `totalMs` mismatch note is stale.

**Shipped fixes (uncommitted):**
- **F2 — split-brain call finalization (REAL BUG, fixed + TDD'd).** `recordEndOfCall` gated BOTH
  concurrency-release and cost-add behind one `alreadyEnded` flag; a client-`endCall`-first teardown made the
  webhook skip `addCost` → the call's cost was silently dropped from `budgetState`. Fix: additive optional
  markers `concurrencyReleased`/`costRecorded` on the `calls` table + idempotent `releaseConcurrencyOnce` /
  `recordCostOnce` helpers in `budget.ts`; `lifecycle.endCall` + `calls.recordEndOfCall` both route through them
  (cost added EXACTLY once in ANY teardown order; concurrency decremented once, never <0; duplicate webhook
  safe). `endCall` no longer hand-inlines the decrement. New `convex/lifecycle.test.ts` (6 tests; the
  dropped-cost case failed pre-fix, passes post-fix).
- **F9 + P3 — typed `getById` seam.** `calls.getById` returned `v.any()`, forcing a 24-line `as {…}` cast in
  `call-report-client.tsx`. Now returns a typed NON-PII projection (`callReportValidator` / `toCallReport`,
  excluding sessionId/vapiCallId/visitorKey + the new markers) — closes the overexposure AND kills the cast
  (client uses the inferred type; `outcomeKey` simplified to `c.outcome ?? "abandoned"`).
- **P5 — `timeAgo` unified (fixes an SSR hydration bug).** Canonical `lib/format.ts timeAgo(from, now)` was
  DEAD; two copies diverged and `calls/page.tsx` called `Date.now()` at render → hydration mismatch. Now one
  pure owner + a hydration-safe `lib/hooks/use-time-ago.ts` (rAF-deferred `setNow`, lint-clean); both callers
  import it; `calls/page.tsx` extracted a `CallRow` so the hook is called legally per row.
- **P6 — span-kind color.** `trace-waterfall.tsx` SPAN_CLS stopped aliasing the frozen `bg-latency-good/slow`
  tokens for stt/llm; now a neutral `bg-foreground/25·45·65` ramp (tool/guardrail keep their categorical colors).

**Deliberately NOT done:** F7 (the 18 `DEBUG(spans)` console logs in `use-vapi-call.ts` + `telemetry.ts`) —
left IN; they're load-bearing for the still-pending live `/try` smoke test (M3/M5/M6). Silence only after that lands.

**Audit backlog — FULLY EXECUTED in 2 file-disjoint subagent waves + gates (2026-06-18, uncommitted).**
✅ `pnpm typecheck` 0 errors · **237 tests pass** (0 failures) · lint **12, ZERO new** (all pre-existing: harness
`any` in calls/ingest tests, leaderboard `<Th>` static-components, theme-toggle/voice-visualizer/use-visitor-key).
- **Wave 1 (A1/A2/A3):** **F1** — server VAPI webhook envelope parsing → NEW `convex/lib/vapiWire.ts` (shared by
  http.ts + vapiReport.ts; killed the duplicated `unwrapMessage`/`pick`/`num`/`str`/`extractToolCalls`). Client
  SDK-message parsing in use-vapi-call.ts deliberately NOT merged (different payload shape + Convex bundles
  convex/ separately from lib/ — honest scope, documented in vapiWire's header). **F6** — `prop` dup → NEW
  `lib/unknown.ts` (prop/asString/asNumber); booking.ts + use-vapi-call use it. **F4** — `ingestDocument` reuses a
  widened `extractAndInsert(ctx, sessionId, prompt, sourceMeta?)`. **F5** — both assistant builders → thin
  adapters over a private `assembleAssistant` core. **P9-hygiene** — `select.tsx` no-op `&& ""` removed;
  `TECHNICAL_NAV_LABEL` exported from `lib/nav.ts` (×3 header sites); `mock.ts`→`providers-catalog.ts` +
  `MOCK_PROVIDERS`→`PROVIDER_CATALOG`; dead `useActiveCallCount`/`useCallsToday` deleted. **Foundations:**
  `inProgress` on `useVapiCall`, `callIsBusy(status)` in `lib/types.ts`, and the 120s cap unified on
  `BUDGET.MAX_CALL_SECONDS` (use-vapi-call + assistant `maxDurationSeconds` + call-controller).
  > GOTCHA (found by agents): a runtime VALUE import of `@/convex/_contracts` (e.g. `BUDGET`) FAILS under vitest
  > in files that ARE imported by a test (no `@/` alias in vitest.config) — use a RELATIVE path there
  > (`../../convex/_contracts`). It's fine in non-test-imported files (use-vapi-call hook, call-controller). Same
  > caveat bit `lib/unknown.ts` in booking.ts → it imports via `../unknown`.
- **Wave 2 (B1/B2):** **P1** — ONE `lib/calls/outcome.tsx` (`CALL_OUTCOME` map); calls-page/report/admin
  centralized; dead `OutcomeBadge` DELETED; recent-activity's `result` enum LEFT as-is (option a — genuinely
  different source/granularity, `noMessage`≠`abandoned`; documented divergence, NOT force-merged). **P4** —
  `spansToWaterfallTurns` → pure `lib/calls/trace.ts`. **P7** — `matchQuery` (module-scope fn in
  `components/states/async-section.tsx`) owns the load→empty→data triad across 5 routes; NO error arm (Convex
  useQuery throws to a boundary, documented). **P8** — `formatDateTime`/`formatCount` added to format.ts; 3 inline
  `.toLocaleString()` bypasses killed (report/leaderboard/owner-stat-card). **P9-label** — `WaterfallSpan.label`
  now actually rendered (`s.label ?? SPAN_LABEL[kind]`). **F3** — `getWithChunks` returns NESTED
  `{ _id, name, profile:{…}, chunks }`; `ConvexBusinessForAssistant` + try/page read `biz.profile.*` (ONE business
  shape; `insertUploadedBusiness` arg shape unchanged). **P2/F8** — shared `<IngestForm>` under url/text/form
  inputs (doc-uploader kept as the genuine drag/drop outlier); the 5 `live||connecting` decodings → `call.inProgress`,
  call-controller `active` → `callIsBusy`.
- **ONE DELIBERATE visible change (flagged, not silent):** `/admin`'s outcome indicator went color-dot → the
  shared icon+label (WCAG-safer, single owner); side effect = the `abandoned` tint shifts amber→muted. Revert just
  that `CALL_OUTCOME.abandoned` color if amber is wanted back on admin.
- **STILL deferred:** **F7** (the 18 `DEBUG(spans)` logs in use-vapi-call/telemetry) — unchanged, load-bearing for
  the pending live `/try` smoke test (M3/M5/M6).

**New modules this session:** `convex/lib/vapiWire.ts`, `lib/unknown.ts`, `lib/calls/outcome.tsx`,
`lib/calls/trace.ts`, `components/states/async-section.tsx`, `lib/hooks/use-time-ago.ts`, `convex/lifecycle.test.ts`,
`lib/format.test.ts`. Renamed: `lib/data/mock.ts`→`lib/data/providers-catalog.ts`.

> **Everything above is the WHOLE audit — backend F1–F9 + presentation P1–P9 — now DONE except F7.** All
> uncommitted (consistent with the working tree's pending commit-split decision). The full audit report (red-flag
> analysis + design-it-twice for the structural items) is in that session's transcript.

## Owner-first repositioning — BUILT + LIVE-VERIFIED via parallel subagents (2026-06-18, uncommitted)

Big strategic pivot, now EXECUTED. The app was framed end-to-end as a developer/eval lab; it is now
repositioned so a **non-technical small-business owner** is the default audience everywhere, with the
eval/credibility showcase preserved behind one **"Behind the scenes"** toggle. Driven via `/architect`
(deep rebuild, owner-only-by-default + toggle, REAL DATA ONLY) then built as a 2-wave **Workflow** of
7 file-disjoint subagents (Stream A + F1/F2 foundation → B/C/D/E owner rebuild) + my integration.

**What actually shipped (diverges from the earlier unexecuted `i-like-this-make-wild-feigenbaum.md` plan —
NO `/try` stage-machine was built; instead a lighter gate + a NEW `/overview` screen):**
- **View-mode spine** — `lib/view-mode.tsx` (NEW): `ViewModeProvider` + `useViewMode(){mode,setMode,toggle}`
  + `<TechnicalOnly>`. Default `"owner"`, persisted to localStorage `"receptionist:view-mode"`. **Uses
  `useSyncExternalStore`** (my integration upgrade — lint-clean, cross-tab sync, SSR snapshot = owner so no
  hydration mismatch). `lib/nav.ts` split → `OWNER_NAV` (Try it · Calls · Overview) / `TECHNICAL_NAV`
  (Leaderboard · Evals · Analytics). Toggle = `components/layout/view-mode-toggle.tsx` (Phosphor Wrench,
  aria-pressed), in header next to ThemeToggle + in the mobile Sheet. Provider wraps the **(site) subtree
  only** in `app/(site)/layout.tsx` → `/admin` has no provider (don't use the hooks there).
- **Owner Overview (NEW)** — `app/(site)/overview/page.tsx` + `components/owner/{owner-stat-card,recent-activity-list}.tsx`
  driven by NEW Convex query `api.ownerStats.summary` (`convex/ownerStats.ts`, indexed `by_status` eq "ended",
  honest counts only). KPIs: **Calls answered / Appointments booked / Messages taken** + recent activity.
  Honest empty state when 0; skeleton while loading. Omitted (can't be honestly derived): after-hours,
  missed/unanswered, revenue; "messages taken" = engaged-but-not-booked (the only `leads` writer is
  `book_appointment` which always also books, so a separate lead count would double-count).
- **`/calls` + report reframed (Stream C)** — rows as "Booked an appointment / Took a message / Answered a
  question" (off the real `outcome` from `listRecentAnonymized`); report leads with booking+summary; trace
  waterfall + cost + quality wrapped in `<TechnicalOnly>` under a "Behind the scenes" heading. Header is
  honest "Recent calls" (NOT "your calls" — it's the shared anonymized feed).
- **Behind-the-scenes framing (Stream D)** — `components/shared/builder-view-banner.tsx` (NEW) atop
  leaderboard/evals/analytics; all real-data-only with skeleton(undefined)/empty([]) states; `/evals` STUB
  data fully gutted → honest empty state (NO `convex/evals.ts` query exists yet — flagged).
- **Owner `/try` + copy (Stream E)** — the `<PipelineSelector/>` ("Voice pipeline") is wrapped in
  `<TechnicalOnly>`; owners never see provider chrome and the call still starts on `DEFAULT_PIPELINE`.
  Plain-language sweep: guardrail chips → "Answers only from your info / Won't make things up / Stays on your
  business / Stays polite"; "Budget guard"→"Spending", "Live trace"→"This call"; landing technical link
  softened ("Curious how it stacks up? Take a look under the hood"); `app/layout.tsx` metadata de-jargoned.
- **All fabricated data removed (REAL ONLY)** — `convex/seed.ts` no longer seeds fake calls/providerStats/
  budget (presets kept); `lib/data/index.ts` dropped MOCK fallbacks → `useRecentCalls()`/`useProviderStats()`
  now return `T[] | undefined` (undefined=loading, []=empty); deleted `MOCK_RECENT_CALLS`/`MOCK_PROVIDER_STATS`
  and the orphaned `components/shared/demo-data-badge.tsx` (`git rm`).

**Verified (evidence):** `pnpm typecheck` 0 errors · **169/169 tests** · lint = baseline + exactly **1 new**
error (`recent-activity-list.tsx:49`, the same relative-time-after-mount idiom already accepted in
`use-visitor-key.ts:14`; `useSyncExternalStore` can't cache live time). Live Playwright smoke on
localhost:3000: owner nav (Try it/Calls/Overview) → toggle reveals Leaderboard/Evals/Analytics; `/overview`
renders real data light+dark; `/try` hides the picker in owner mode, shows it in technical; **0 console
errors / 0 hydration warnings**.

> ✅ **DATA CLEANUP DONE:** re-ran `pnpm convex run seed:seed` (user-authorized) — purged the 3 fabricated
> seed calls + 8 fake providerStats from the live dev DB. Verified: `/overview` and `/calls` now render the
> honest **"No calls yet"** empty states (light+dark). DB holds presets + a zeroed budget only; everything
> shown is real. NOTE the seed stays destructive (clear-then-insert) — re-running it wipes any real calls.

**Minor follow-ups left:** `components/layout/site-footer.tsx` still says "Recent Calls"/"Anonymous demo"
(not in any stream's scope — align to "Calls"/soften "demo"); no `convex/evals.ts` query (evals = honest
empty state until one exists); pipeline-selector internal labels stay technical (only shown behind the toggle).

<details><summary>Earlier UNEXECUTED plan (historical)</summary>

The prior section here described `~/.claude/plans/i-like-this-make-wild-feigenbaum.md` — a heavier `/try`
guided stage-machine (`components/try/stages/*`), `use-advanced-mode.tsx`, owner nav = `Try it`+`Recent calls`.
That plan was NEVER approved/executed; the build above supersedes it (different toggle file/name, no stage
machine, added `/overview`). The `try-redesign-preview.html` mockup under `.superpowers/brainstorm/` is stale.
</details>

**Locked decisions (user-confirmed via AskUserQuestion):**
- **`/try` = guided journey:** demo-intro → call **Glow Dental** (default demo preset, `lib/data/presets.ts`)
  → demo-recap → "Add my business" (website-first onboarding) → call YOUR receptionist → recap. Plain
  language, no jargon. Decompose into `components/try/stages/*` (DemoIntro, CallStage shared, Recap shared,
  Onboarding, YourIntro) so `app/(site)/try/page.tsx` becomes a thin `Stage` machine.
- **Advanced = ONE global toggle** (NOT per-surface, NOT a separate /lab area). New
  `lib/hooks/use-advanced-mode.tsx` context+hook: OFF by default, persisted in `localStorage` + readable from
  `?advanced=1`, auto-forces ON when on a lab route. ON reveals: lab nav links, the `/try` lab panels
  (pipeline/trace/guardrails/budget → new `components/try/advanced-panels.tsx`), the report's technical tier,
  and the header budget pill.
- **Owner nav = `Try it` + `Recent calls`** only (+ "Talk to a receptionist" CTA). Split `lib/nav.ts` into
  `OWNER_NAV` / `LAB_NAV`; `site-header.tsx` shows LAB_NAV only when advanced.
- **Backend untouched** — pure presentation/IA/copy reframe. Reuse as-is: `useVapiCall`, assistant builders,
  all Convex ingestion (`sources.ts`/`ingest.ts`/`businesses.ts`), `bookingFromStructuredData`/`AppointmentCard`,
  guard/budget, and every existing `components/try/*` + shared component. Brand stays Signal Bold.

**Phases in the plan:** Foundation (use-advanced-mode) → P1 `/try` stage machine → P2 nav/IA + header toggle →
P3 report split (`call-report-client.tsx` left=owner / right=advanced) + `/calls` feed (hide provider row) →
P4 copy/landing/metadata + jargon sweep + honesty (move always-green guardrail chips to Advanced — resolves
the standing honesty flag; do NOT repaint `cost-breakdown.tsx`, its neutral grays are correct).

**Verification target:** `pnpm typecheck`/`test`/`lint` (no new errors), live `/try` smoke test on localhost
(full journey + verbal hang-up), Advanced ON/OFF across all surfaces + `?advanced=1` deep-link + localStorage
persistence, Playwright light+dark screenshots. Keep `convex dev` running (dev deploy must stay on Phase-3
telemetry commit `1e62781`).

**Supersedes the old "Craft sweep" / "UI completion" next-steps** below as the authoritative direction — those
remain for detail (lucide→Phosphor, depth unification, copy) and fold into P4. The `/leaderboard` redesign
already done this session-range still stands.

## End-call fix — dead button + mispositioned rings + verbal hang-up (2026-06-18, uncommitted)

User reported the `/try` end-call surface still broken (built+typechecked before, **never run live**).
Diagnosed via `/recover` as Failure Mode 1 (specific isolated bugs), root causes confirmed by reading
files + the VAPI SDK types. **Three surgical fixes** (`pnpm typecheck` 0 errors · 169/169 tests):
- **Dead End button** — the live countdown ring `<svg>` in `call-controller.tsx:62` paints on top of
  the End button (positioned vs in-flow) with **no `pointer-events-none`**, swallowing the click.
  `useVapiCall.stop()` was correct, just never called. Fix: added `pointer-events-none`.
- **Off-center countdown ring** (same SVG) — `92px` over a `64px` (`size-16`) button at `-inset-1.5`
  (−6px) is over-constrained (`-6+92-6=80≠64`) → ~8px down-right. Fix: `-inset-3.5` (−14px → `=64`,
  concentric, transform-free so `-rotate-90` is untouched).
- **Connecting pulse-ring** mispositioned (`agent-stage.tsx:50`) — `absolute size-32` with no offsets
  → pins top-left. Fix: `inset-0 m-auto` (auto-margin centering, NOT a transform — the `pulse-ring`
  keyframe owns `transform: scale()`). Added `pointer-events-none` to both rings.
- **No verbal hang-up** (`lib/vapi/assistant.ts`) — assistant had no `endCall` tool / `endCallPhrases`
  / prompt instruction, so the LLM literally couldn't end the call. Layered fix: `END_CALL_TOOL =
  { type: "endCall" }` always appended to model tools (both `buildAssistant` +
  `buildAssistantFromConvexBusiness`; `fnTools` now `[]` not `undefined`); one system-prompt line
  telling it to farewell+hang up on caller request; `endCallPhrases` backstop (conservative:
  goodbye / have a great day / talk to you later). Verified shapes vs `@vapi-ai/web@2.5.2`
  (`CreateEndCallToolDTO` = `{type:"endCall"}`, top-level `endCallPhrases?: string[]`).

**LIVE `/try` SMOKE TEST PASSED (user-confirmed, 2026-06-18):** clicking End now ends the call (button
no longer dead), the rings render correctly, and the call ends on a verbal request. The `pointer-events-none`
overlay theory for the dead button was **confirmed correct** — no teardown re-diagnosis needed. This also
clears the long-standing "verify the `ended` state on a live call" / "never rendered" flag elsewhere in
this file. Plan: `~/.claude/plans/the-end-call-functionality-transient-parrot.md`. **Still uncommitted.**

## Code-review remediation — Next.js best-practices pass (2026-06-18, uncommitted)

Ran a multi-agent `/code-review` (Next.js 16 focus) over the full diff (committed BYOD + uncommitted UI):
72 raw → 39 unique → **23 verified findings**, then **fixed all 23** via 5 file-disjoint parallel
subagents + integration. ✅ `pnpm typecheck` 0 errors · 169/169 tests (added ~25 new) · **no new lint**
(removed 2 voice-visualizer ref-in-render errors; 7 remaining are all pre-existing `any`/unused-var/
set-state-in-effect). Final adversarial review verdict: **READY, no Critical/Important.** Nothing committed.

**Two new gotchas this introduced:**
- **`convex/lib/ingest_helpers.ts` is now `"use node"`** (line 1). The SSRF fix (H1) resolves hostnames via
  `node:dns`, which only bundles in Convex's Node runtime. Its only importers (`sources.ts`, `ingest.ts`) are
  already `"use node"` — do NOT import it from a V8-runtime query/mutation or `convex codegen` fails to bundle.
- **`calls.getById` is now ownership-gated on `visitorKey`** (NOT sessionId). The `/calls/[id]` report page is
  therefore **owner-only**: a third party opening a shared link gets `null` → "Call not found". This closes the
  PII/IDOR (M2) but means the public `/calls` feed → report navigation only works for the call's own visitor.
  If public report viewing is wanted, add a separate PII-stripped single-call query. `recordQualityMetrics`
  still gates on `sessionId` (the active-call client has it); `getById` gates on `visitorKey` (the report page
  only has that, persisted via `useVisitorKey`; `startCall` stores it on every row).

**What got fixed (by area):** SSRF blocklist→DNS-resolution + `isPrivateOrReservedIp` (H1); ICS route
try/catch + NaN-safe slot parse, 404-not-500 on malformed id (H2/N1); `sanitize()` honest docstring +
untrusted-text fence in `buildExtractionPrompt` (M1); `getById` visitorKey gate (M2); `runFinalFlush`
await+retry+setError (M4); `interruptions` now computed from raw events not always-0 spans + false-passing
test fixed (M3); `wpm` tts-duration estimate for single-final turns (M5); broadened tool-message gate (M6);
deadAir includes llm spans (L3); image-OCR error normalized (L4); ingestText trim-before-measure (L5);
htmlToText numeric/hex entities (L6); recordTurns skip-unchanged-patch (L1); batchWriteSpans N+1→single
collect (L2); volume rAF-throttle + AgentStage memo (N2); `viewport` themeColor/colorScheme (N3); url/paste
`<form>` + Enter/Cmd-Enter submit (V1); canStartCall visitorKey→optional (C2); try/page indent (C3);
voice-visualizer in-view-gated rAF + mode-ref (C4); `extractAndInsert` dedup (C1); globals.css letter-spacing
documented as Signal-Bold exception (V2, NOT re-scoped — left for a visual pass).

**Still needs a live `/try` smoke test (interim mitigations shipped, not settled in code):** **M6** (confirm
real VAPI message `type` strings populate tool spans) and **M5/M3** (confirm single-final transcript shape +
that VAPI interleaves barge-in transcripts) — same smoke test already pending for the `ended`-state visual.
**Residual SSRF TOCTOU** (validated IP vs. fetch re-resolving DNS) and NAT64/6to4 IPv6 unwrap left as
documented low-risk hardening.

## Dummy-data cleanup (2026-06-18, uncommitted)

Replaced the large fabricated dataset with a **small, labeled demo seed** (presets untouched).
Source of fake numbers was the SAME dataset written twice — `lib/data/mock.ts` (fallback) +
`convex/seed.ts` §2–4 (live DB) — plus a standalone `STUB_RUNS` on `/evals`.
- `lib/data/mock.ts`: deleted dead exports `MOCK_BUDGET`/`ACTIVE_CALL_COUNT`/`CALLS_TODAY`;
  trimmed `MOCK_RECENT_CALLS` 12→3 (preset businesses only, dropped ghosts Bright Smiles/Urban Cuts);
  reset `MOCK_PROVIDER_STATS.callCount` to small demo values (1–2). **Kept `avgRating` (4.0–4.8)** as
  illustrative — zeroing it broke the leaderboard rating column + the `avgRating`-sized bubble chart.
- `convex/seed.ts`: §2 callCount reset (mirror), §3 loop 12→3 preset-only (removed `fallbackBusinessId`
  FK hack), §4 budget spend `12.4/2.4 → 0`. `seed.test.ts` calls-length 12→3.
- New `components/shared/demo-data-badge.tsx` → "Demo data" badge on `/leaderboard` `/analytics`
  `/calls` headers. `/evals`: added "Sample data" banner + reframed the danger "Regression detected"
  block to a neutral "(sample)" note.
- **Out of scope (user decided "numbers/data only"):** `/try` always-green guardrail ✓ chips and the
  leaderboard "measured from real calls" tagline left as-is — flag for a later UI-honesty pass.
- ✅ `pnpm typecheck` clean · 189/189 tests · no new lint. **NOT re-seeded:** the live Convex dev DB
  still holds OLD seeded values until `seed` is re-run (clear-then-insert — destructive to any real calls).

## Doc streamlining + audit (2026-06-18, uncommitted)

Audited every repo `.md` against git/code ground truth and fixed contradictions/stale data. Full inquiry:
`docs/md-audit-2026-06-18.md`.
- **Deleted `design-guide.md`** — it was a "Braindump" journaling-app UI plan (wrong product), tracked in git.
- **`ui-development-plan.md`** — rewrote §2 to Signal Bold (mirrors `app/globals.css` + `app/layout.tsx`),
  purged deleted components (`LiveSignalChip`/`RecentCallTicker`/orb → `VoiceVisualizer`), reconciled §3.1
  landing to the rebuilt layout, updated the §4 Stitch prompts (incl. lucide → Phosphor).
- **`phase3-make-the-trace-real.md`** status line fixed: committed as `1e62781` (not "Not yet committed"),
  not yet merged to `main`.
- **This `memory.md`** — fixed the committed-vs-uncommitted split (BYOD IS committed) and the Phase-3 label
  clash with `plan.md` (its Phase 3 = telemetry; the /try+dashboards work is a separate UI track).
- **Verified false positives (do NOT "fix"):** Phase 3 telemetry is NOT on `main` (the Convex-ahead warning is
  correct); `docs/ui-rebrand-plan.md` is already deleted; blue refs live only in abandoned `.claude/worktrees/`.
- Docs-only; no code touched. Left intentionally: `designtaste.md`, `AGENTS.md`, `plan.md`, `CLAUDE.md`,
  phase1/ws0.5 plan docs.

## Leaderboard redesign (2026-06-18, uncommitted)

Killed the `LatencyCostChart` quadrant scatter on `/leaderboard` — it stacked 5 encodings
(x=latency, y=cost, size=rating, shape=kind, dashed-ring=custom) and plotted STT/TTS/LLM on
shared axes despite incomparable ranges; conveyed no actionable answer. Rebuilt
`app/(site)/leaderboard/page.tsx` in Signal Bold, data-dense:
- **Tabs promoted to the page's organizing principle** (one comparable provider *kind* in view).
- Per tab: 3 **leader callouts** (Fastest / Cheapest / Top-rated — the cross-metric winners no
  single sort shows at once; amber Phosphor icon = the one view accent) + a ranked table.
- Table gains a **Rank #** column and **in-row data bars**: latency uses the FROZEN latency color
  scale (`latencyColorVar`, semantic), cost uses neutral `bg-foreground/30`. Bars normalized to the
  **column max within the tab** (cross-kind bars would be apples-to-oranges). `Calls` de-emphasized
  (sample size, muted/xs). Local `MetricBar` helper (static width, no transition; `aria-hidden`).
- lucide `ArrowUpDown` → Phosphor `ArrowsDownUp`; sort default flips dir sensibly per key
  (latency/cost asc, rating/calls desc). Subtitle reworded off the dishonest "measured from real
  calls" → "Compare speed, cost, and quality…" (Demo-data badge already states provenance) —
  resolves the honesty flag left in the dummy-data cleanup section above.
- ✅ `pnpm typecheck` clean. Lint: only the 4 PRE-EXISTING `react-hooks/static-components` errors on
  the render-defined `<Th>` (same count as before — no new ones). **Visually verified light (STT) +
  dark (TTS)** via Playwright on a live server — bars, frozen colors, single accent all hold.
- 🗑️ Deleted `components/shared/latency-cost-chart.tsx` (orphaned — leaderboard was its only importer;
  analytics has its own AreaChart) and dropped its mention from the `lib/format.ts` header comment.
  `recharts` stays (analytics still uses it).

## Craft sweep — full-app audit + approved plan (2026-06-18, PLAN-ONLY, not executed)

Ran a craft-first interface-design audit of ALL 8 routes (`/` `/try` `/calls` `/calls/[id]`
`/analytics` `/evals` `/leaderboard` `/admin`) + shell + shared components + UI primitives
(3 parallel Explore agents). Wrote an approved plan — **full sweep, all 4 streams**:
`~/.claude/plans/systematically-go-through-every-lucky-map.md`. **No code changed (plan mode).**

Four change streams (user approved ALL four):
1. **lucide → Phosphor** across ~28 files (full per-file checklist in the plan). Goal:
   `grep -rn lucide-react app components` → 0. `leaderboard/page.tsx` + `site-header.tsx` =
   import-style reference. + system hygiene: badge `rounded-4xl`→`rounded-full`; stale
   "blue accent" comment `globals.css:8-9`; add a z-index scale (header `z-40` vs overlay
   `z-50`) + `env(safe-area-inset)` on the fixed header/sheet; doc the `(site)/layout.tsx`
   `pt-14` magic offset; `/evals` hand-rolled banners → existing `<Alert>`; `/admin`
   locked-state → `EmptyState` + `dvh` (not `60vh`).
2. **Depth-strategy unification** — the shadcn `ring-1 ring-foreground/10` tell (removed from
   `card.tsx`) SURVIVES in `select.tsx:72`, `dialog.tsx:64`, `dropdown-menu.tsx:46,247`,
   `popover.tsx:33` → swap to `border border-border` + keep shadow. `sheet.tsx` already does
   it right (use as the pattern).
3. **Live visualizer on `/try`** — `agent-stage.tsx:54-79` orb STILL uses a `bg-gradient-to-br`
   gradient + a volume-driven `boxShadow` glow (BOTH violate AGENTS.md: no gradients, no glow
   affordance) and is NOT wired to `VoiceVisualizer`. Replace with
   `<VoiceVisualizer mode="live" level={volume} speaking={agentSpeaking} active={live} />`;
   keep the calm `ended` disc (swap lucide `Check`→Phosphor). Needs a live-mic smoke test → do LAST.
4. **Honesty + copy** — `cost-breakdown.tsx:8-13` reuses the FROZEN latency scale
   (`bg-latency-good`/`bg-latency-slow`) for COST → neutral mono opacity ramp
   (`bg-foreground/20·35·50·65`); `/try` always-green guardrail ✓ chips → neutral
   informational (Phosphor `ShieldCheck`, not green); jargon (trace/eval/benchmark/TTFW/
   "120-second cap") → layperson in `guard-panels.tsx`, `budget-meter.tsx:92-95`,
   `call-report-client.tsx:184`; Enter-to-submit on `url-input.tsx`/`text-paste.tsx`.

**Verified corrections to the audit (read the files myself):**
- `cost-breakdown.tsx` latency-for-cost misuse = REAL (confirmed lines 9-10).
- `trace-waterfall.tsx:83` audit OVERSTATED — the color is ALREADY `latencyTextClass(turn.ttfwMs)`,
  not `totalMs`; only a value/color mismatch (the *number* shows `totalMs`). Minor — show
  `ttfwMs` (label "first word") so number matches its color.
- `agent-stage.tsx` orb gradient + glow confirmed present; `VoiceVisualizer` props
  (`mode/level/speaking/active`) confirmed available.

**Suggested commit order:** 1a lucide → 2 depth → 1b hygiene → 4 copy → 3 visualizer (last).

## Locked decisions

- **Identity "Signal Bold" (LOCKED):** Space Grotesk (heading) / Hanken Grotesk (body) / IBM Plex Mono
  (data); warm paper `#F4F4EE` + ink `#121210` + ONE amber `#EA580C` accent; near-monochrome.
  Buttons are **ink-on-amber** (passes WCAG AA; white-on-amber failed). **Phosphor** icons, not lucide.
  Rejected: Fraunces/clay palette, emerald accent. The old blue (`#2563eb`) `docs/ui-rebrand-plan.md`
  was **deleted** — do not reintroduce a blue direction.
- **Scope split:** `designtaste.md` governs LANDING + marketing only. Dashboards + `/try` inherit brand
  tokens but keep data-dense patterns.
- **Voice visualizer honesty:** synthetic `demo` mode on the hero only; `/try` in-call MUST be driven by
  real data (VAPI `volume` + `agentSpeaking`).
- **Appointments:** inline booking via **Convex reactivity** (subscribe to the call record), NOT the
  fragile VAPI tool-result stream. Voice-driven, no calendar picker. One reusable card across `/try` + report.
- Use **pnpm**, never npm.

## What's done (all verified: `pnpm typecheck` clean, eslint clean on changed files, 189/189 tests pass)

- **Phase 1 — design system:** `app/layout.tsx` (fonts via `next/font/google`), `app/globals.css`
  (Signal Bold tokens, tuned dark mode, frozen `--latency-*` preserved), `components/ui/card.tsx`
  (removed the shadcn `ring-1 ring-foreground/10` tell → `border shadow-sm`).
- **Phase 2 — landing:** `components/shared/voice-visualizer.tsx` (NEW; 5-bar amber equalizer,
  `demo`/`live` modes, transform-only, IntersectionObserver pause, reduced-motion static).
  `app/(site)/page.tsx` rebuilt (asymmetric hero with live component preview, no bento/orb/ticker).
  `site-header.tsx` → Phosphor. Installed `@phosphor-icons/react` 2.1.10; deleted retired landing tropes.
  Adversarial Pre-Flight review passed (button contrast, redundant "live" label, status-dot glow fixed).
- **Appointment UI:** `lib/calls/booking.ts` (+ `booking.test.ts`, 21 TDD tests) — pure
  `bookingFromStructuredData()` + timezone-stable `formatSlot()`. `components/shared/appointment-card.tsx`
  (chrome-less, real `.ics` via `/api/ics/${confirmationId}`). `Booking` type in `lib/types.ts`. Inline
  reactive card on `/try` (`useQuery(api.calls.getById)` → renders the instant `book_appointment` patches
  `structuredData`); `call-report-client.tsx` swapped its JSON dump for `<AppointmentCard>`.
- **End-call hardening (`lib/vapi/use-vapi-call.ts`):** `stop()` is optimistic (status → `"ended"`
  immediately, clears agentSpeaking/volume, stops timers, surfaces teardown errors via `setError`).
  `runFinalFlush()` fires the final flush (spans+turns+metrics) exactly once from either the End button or
  SDK `call-end`, so metrics persist even if `call-end` never fires.
- **Call-end VISUAL fix:** `agent-stage.tsx` has a calm `ended` branch (neutral disc + lucide `Check`);
  `call-controller.tsx` gates the round-button row behind `status !== "ended"` and renders one primary
  `View post-call report` + a quiet `Start another call` (via `reportHref` prop). The composition
  (single primary CTA, calm done-state) is direction-agnostic — carry it forward when the orb is retired,
  swapping lucide `Check` → Phosphor and the disc → the visualizer's at-rest form.
- **Convex deploy synced** + `providerStats.list` return-validator bug fixed (was returning raw
  `_id`/`_creationTime` docs against a clean validator → now maps to clean `ProviderStat`; last instance
  of that bug class). Removed 7 extraneous `beginCall` deps; one `as any` → `as Id<"businesses">`.

## Open code-review findings (committed range `f7d747e..35e1d30`; report-only, nothing applied)

Verdict was **merge WITH FIXES — no Critical issues.** When BYOD is next touched, start with the two cheap
verified security fixes:
- **[Important] SSRF gap in `assertSafeUrl`** (`convex/lib/ingest_helpers.ts:157-195`): blocks IPv6
  `fe80:` but not IPv4 link-local `169.254.` (cloud metadata → credential theft), `::ffff:`
  IPv4-mapped loopback, or `0.x`. Cheap fix: add those to the blocklist. Full DNS-rebind fix needs
  resolving the host and validating the resolved IP.
- **[Important] `sanitize()` over-claims** (`ingest_helpers.ts:4-6`): `^`-anchored regex only redacts
  line-LEADING injection tokens; mid-text passes through. Real defense is the bounded
  `businessProfileSchema`. Fix: honest docstring + delimit ingested text in the extraction prompt.
- **[Important] `toolEventsFrom` guesses VAPI payload shapes** (`use-vapi-call.ts:62-95`, has a
  `TODO(vapi-shape)`). **Needs a live `/try` smoke test** to confirm tool spans populate — cannot be
  settled in code.
- **[Minor]** `htmlToText` skips comments/`<noscript>`/numeric entities; quality metrics shown precise
  but built on `approx`-flagged spans; URL/paste `/try` inputs don't submit on Enter
  (`url-input.tsx`, `text-paste.tsx`); `recordTurns` hardcodes `interim: false`.

Reviewer subagent left alive: `ae73ec9cec5652caf` (SendMessage to continue/push back).

## Next session starts with

0. **Execute the approved craft-sweep plan** — `~/.claude/plans/systematically-go-through-every-lucky-map.md`
   (full-app Signal Bold consistency, all 4 streams; see the "Craft sweep" section above). This is now the
   authoritative next step and **supersedes/expands items 1 & 3 below** — they remain for detail. Plan-only
   so far; nothing built.
1. **UI completion pass — `/try` + dashboards** (NB: plan.md's "Phase 3" = telemetry, already committed as `1e62781`; this is the remaining UI work, a separate track). ✅ `/leaderboard` DONE this session (see "Leaderboard redesign" above — quadrant scatter killed, leader callouts + in-row latency/cost bars, verified light+dark). Remaining: wire `VoiceVisualizer mode="live"` into `/try` (retire the orb in
   `agent-stage.tsx`, drive from `useVapiCall` `volume` + `agentSpeaking`), preserving the call-end
   composition above. Reframe trace/budget/guardrail labels for non-technical readers; migrate remaining
   lucide → Phosphor (analytics/page.tsx + agent-stage `Check` still on lucide). Keep data-dense layouts.
   **Visually verify the `ended` state on a live call (light + dark) — only typechecked, never rendered.**
2. **Visually confirm the appointment card on a live booking** (needs the AI to call `book_appointment`
   mid-call) — still pending.
3. **Phase 4 (copy pass):** plain language + em-dash purge + middle-dot rationing across
   `components/states/guard-panels.tsx`, dashboards, metadata; run the designtaste Copy Self-Audit.
4. Re-screenshot all surfaces light & dark; full `pnpm typecheck` + a targeted `/try` smoke test.

## Open questions

- Add real small-business photography to the landing? (hero already uses the live component preview;
  photos optional)
- Commit/merge path for `feature/byod-try-page` — split the uncommitted streams (Signal Bold UI, booking,
  call-end fix, dummy-data cleanup, leaderboard redesign) into separate commits, and decide the merge order onto `main`.
- ✅ Resolved: `docs/stitch-reference/` (9 Stitch PNG mockups, likely the old indigo palette) is **kept as
  historical** — not regenerated. No leftover blue survives in the superpowers plans (phase2/ws1 plan docs no
  longer exist; phase1/phase3/ws0.5 carry no blue).

## Reference

- Lint baseline: ~32 PRE-EXISTING errors unrelated to this work (react-hooks rules). Don't fix unless asked;
  goal is to add no new ones.
- Dev server: `pnpm dev` on localhost:3000. Mic-driven preview needs `localhost` (secure context), not `file://`.
- Approved plan (current): `~/.claude/plans/systematically-go-through-every-lucky-map.md` (craft sweep,
  all 8 screens). Prior: `~/.claude/plans/the-ui-feels-very-mossy-steele.md`.
