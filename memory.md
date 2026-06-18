# Memory — Signal Bold UI + BYOD/appointment + Phase 3 telemetry

Last updated: 2026-06-18 (code-review remediation — 23 findings fixed) · Branch: `feature/byod-try-page`

> ⚠️ **Two gotchas that bite first:**
> 1. **Committed vs uncommitted on this branch.** Already committed (ahead of `main`): Phase 3 telemetry
>    (`1e62781`) + BYOD (`b77d97f`→`35e1d30`). Still **uncommitted** in the working tree: Signal Bold UI
>    (Phase 1+2), the appointment/booking UI, the call-end fix, the providerStats / use-vapi-call hardening,
>    the dummy-data cleanup, the docs streamlining + audit, and the **leaderboard redesign** (incl. the
>    `git rm` of `latency-cost-chart.tsx`). Decide whether to split the uncommitted streams into separate commits.
> 2. **Convex dev deployment is AHEAD of `main`** (main lacks Phase 3 telemetry, commit `1e62781`).
>    Deploying main or a pre-Phase-3 branch to it reintroduces `ArgumentValidationError` on
>    `telemetry.batchWriteSpans`. Keep `convex dev` running; whatever merges MUST include `1e62781`.

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
