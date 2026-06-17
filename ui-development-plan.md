# VAPI Voice Receptionist Showcase — UI Development Plan (Phase I)

> **Step 1 of the design pipeline.** This document is the blueprint fed into **Google Stitch** to generate
> every screen, then into **Lovable/shadcn** for React components, then wired to the **Convex + VAPI**
> backend. It maps every screen with layout, sections, components, interactions, states, and representative
> copy — at the fidelity of a professional UI dev plan. (Lovable Cloud / Stripe steps are intentionally
> skipped — this app is anonymous with no auth and no payments.)

---

## 1. Introduction

**Product one-liner.** A web-only, fully-anonymous, document-grounded AI voice receptionist demo: a visitor
picks or uploads a business document, then talks live in-browser (WebRTC) to a receptionist that answers FAQs
from the doc, proposes/"books" appointments, and captures intent.

**Design thesis.** The site is a credibility piece aimed at technical peers and prospective employers/clients.
Two non-negotiables drive every screen: (1) it must look **polished and production-grade**, and (2) it must
**make the engineering visible** — live tracing, provider benchmarking, eval harness, cost/budget guard, and
guardrails are surfaced as first-class UI, not buried.

**Global conventions (apply to every screen).**
- **Light & dark parity.** Semantic tokens only; dark is tuned for equal contrast, never a naive invert.
- **Fully responsive.** 12-col dashboards ≥lg, 2-col md, single-column below md; touch targets ≥44px; charts
  switch to legend-below on mobile.
- **Loading / empty / error on EVERY list and detail view.** Shared skeleton, empty-with-CTA, and
  error-with-retry templates — never ad-hoc, never a blank box.
- **Anonymous, no-auth, no-payments.** No login/profile/billing screens. Admin is a private, env-gated console.
  Recording consent shown before the first call; PII redacted; all data auto-purges in 24h.
- **Cost safety is a visible feature.** Hard $40 global cap, $8/day, 2 calls/visitor/day, 3 concurrent,
  120s/call — each with a graceful, branded UI state.
- **Reactivity.** All live/real-time UI is powered by Convex reactive queries; voice via the VAPI Web SDK
  (mounted only on the call loop).
- **Persistent top nav:** Try It · Leaderboard · Evals · Analytics · Recent Calls · light/dark toggle.
  (Admin hidden/env-gated.)

---

## 2. Design System (Foundation)

*Route: `_foundation` — applies globally via the app shell; no standalone route.*

The single source of visual + interaction truth that Stitch and Lovable consume so all generated screens stay
coherent, accessible, and on-brand. Aesthetic: **calm-but-technical**, near-monochrome slate with one
restrained indigo/violet accent, mono for all numbers/IDs.

### Color tokens (light + dark parity)
- **Neutral surface ramp** — `--background, --foreground, --card, --popover, --muted, --muted-foreground,
  --border, --input, --ring`. Light bg `#FAFAFB`, card `#FFFFFF`, border `#E7E8EC`; dark bg `#0B0D12`, card
  `#14171F`, border `#232733`. Tuned so card-on-background lift reads in both themes.
- **Brand accent ramp** — `--primary` (indigo `#4F46E5` light / `#6366F1` dark), `--primary-foreground`,
  `--accent` (violet wash for hovers/selected rows). Drives CTAs, active nav, focus ring, AgentStage orb base.
  → maps to `<CallController>`, `<AgentStage>`.
- **Semantic state colors** — success `#16A34A/#22C55E` (booked, pass, healthy budget), warning `#D97706/#F59E0B`
  (approaching limit, degraded latency), danger `#DC2626/#EF4444` (error, budget reached, fail), info
  `#0EA5E9/#38BDF8` (consent). Each ships a `-subtle` ~12% alpha fill. → `<BudgetMeter>`, `<EvalResults>`.
- **Latency × Cost encoding scale (FROZEN, reused everywhere).** Latency p50 buckets: good `<500ms` (success),
  ok `500–900ms` (lime/amber), slow `900–1500ms` (warning), bad `>1500ms` (danger). Cost encoded via
  opacity/bubble fill on the same hue family — "fast+cheap" reads green-bright, "slow+expensive" red-muted.
  Identical thresholds in `<LatencyCostChart>`, `<TraceWaterfall>`, `<LeaderboardTable>`, `<CostBreakdown>` so a
  color means the same thing app-wide.

### Typography / spacing / radius / elevation
- **Type:** Geist Sans (UI), Geist/JetBrains Mono (all numbers, latencies, costs, IDs, transcripts,
  `tabular-nums`). Display 32/40 → caption 12/16. Headings tracking −0.01em.
- **Spacing:** 4px base, 8-step scale (4/8/12/16/24/32/48/64). Section gap 24–32, card padding 16–24.
- **Radius:** sm 6 (chips), md 8 (inputs/buttons), lg 12 (cards/popovers), xl 16 (modals/AgentStage), full
  (orb/avatars/dots).
- **Elevation:** 0 page → 1 hairline border (cards) → 2 sm shadow (popover) → 3 md (modal/sheet) → 4 lg (toast).
  Dark mode uses lighter surface tints instead of heavy shadows. Hover raises interactive cards 1→2 over 150ms.

### App chrome
- **TopNav** — 56px fixed, backdrop-blur, `border-b`. Left wordmark + live waveform glyph; nav links with active
  underline/pill; right cluster has a live **BudgetMeter mini-pill** + ThemeToggle. `aria-current=page`; stronger
  blur/border on scroll. Collapses to a focus-trapped **MobileNav** Sheet below md (budget pill stays visible).
  → `<BudgetMeter>`.
- **ThemeToggle** — Sun/Moon, three-state (light/dark/system), persists to localStorage, respects
  `prefers-color-scheme`, no flash (inline script).
- **Admin entry (hidden)** — no DOM link; reachable only at `/admin`, env-gated, renders "Not found" when off.
- **Footer** — slim row (stacked on mobile), muted text, mono build/commit hash. Copy: "Anonymous demo · No
  signup · Calls auto-purge after 24h · PII redacted." Privacy link opens the shared consent dialog.

### Brand chips & status badges
- **ProviderChip** — rounded chip: 14px monochrome brand glyph + name + optional role suffix (STT/LLM/TTS);
  brand color only as a 2px left dot. Selectable in PipelineSelector, static-with-tooltip elsewhere.
  → `<PipelineSelector>`, `<LeaderboardTable>`, `<CostBreakdown>`.
- **StatusBadge (frozen vocabulary)** — Call: idle (muted) · connecting (info, pulsing) · live (success/recording
  pulse) · ended (neutral). Outcome: booked (success check) · intent (info bookmark) · abandoned (muted/amber).
  Eval: pass (success check) · fail (danger x). Always icon+label paired so meaning never depends on color alone.
  → `<CallController>`, `<CallTimeline>`, `<EvalResults>`.

### Toast system (sonner)
Bottom-right desktop / top-center mobile; richColors mapped to semantic tokens; max 3 visible, 4s default,
sticky-with-Retry for errors. Variants success/info/warning/error/loading + promise pattern. `aria-live` polite
(assertive for errors).

### Reusable state templates (every list/detail implements)
- **Skeleton kit** — per-surface skeletons (table rows matching column widths, chart axis-ghost + shimmer plot,
  card grid, transcript lines, AgentStage idle-shimmer) sized to final layout to avoid shift; degrades to static
  pulse under reduced-motion.
- **EmptyState** — centered icon + headline + one-line guidance + primary CTA routing to the unblocking action.
- **ErrorState** — danger icon + plain-language cause + Retry (re-invokes the failed Convex query/action) +
  secondary "View status"; inline (in-card) and full (page) variants; backoff hint on repeat.

### Global guard / limit templates (calm, branded, auto-clearing via Convex reactivity)
1. **Concurrency** — "Demo's busy — all 3 live slots are in use…" (info banner + "watch leaderboard while you wait").
2. **Per-visitor cap** — "You've used both of your 2 free calls today. Resets in 7h 12m." (warning, live countdown).
3. **Daily budget** — "$8 daily budget hit to keep this free. Try again tomorrow." (warning + BudgetMeter at cap).
4. **Total budget** — "We've reached the $40 global budget — voice is paused, but every benchmark, trace, and eval
   is still explorable." (danger-but-friendly, no retry, redirects to read-only).
5. **Mic permission** — request + denied-recovery steps.
6. **Recording consent** — first-call modal, checkbox + "I understand, start call," persisted per session.
7. **Time cap** — in-call 120s wrap-up toast.

### Accessibility & responsive foundation
2px focus-visible ring with offset; skip-to-content; dialogs trap+restore focus; WCAG-AA contrast (4.5:1 / 3:1);
color never the sole signal (icon/label/shape). Breakpoints sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536.
`prefers-reduced-motion` disables orb/waveform, pulses, shimmer, slides → instant/opacity.

---

## 3. Screen Inventory

### 3.1 Landing Page — `/`

**Purpose.** The front door. In ~5s convey: a doc-grounded AI voice receptionist you can talk to right now
in-browser, no signup, built to a production bar. Single-screen, scannable marketing page whose only conversion
goal is routing into Try It. Secondary thesis: credibility, proven live via a realtime anonymized Recent Calls
element.

**Layout overview.** Single vertical-scroll page, max ~1200px, calm-but-technical, mono accents. Sticky
transparent-over-hero nav that gains blur on scroll. Sections top→bottom: Hero → How it works (3 steps) → "What
makes this serious" (5 engineering teasers) → Recent calls (live proof) → Privacy trust band → Footer. Recharts
NOT used here — small static SVG mini-glyphs tease the internal viz.

**Sections & key components.**
- **NavBar / ThemeToggle** — sticky, wordmark "Receptionist · voice AI", links + accent CTA "Talk to a
  receptionist," hamburger sheet on mobile (CTA stays in bar).
- **Hero** — `HeroHeadlineBlock` (mono eyebrow "DOCUMENT-GROUNDED · WEB-ONLY · NO SIGNUP", headline "Talk to an
  AI receptionist that actually knows the business."), `HeroCTAGroup` (primary → `/try`, secondary smooth-scroll;
  micro-reassurance "No signup · 120-second demo call · Mic asked once") → **CallController**, `LiveSignalChip`
  (pulsing dot + reactive "2 calls live now · 41 today"), `HeroVisual` (Variant A faint 3-col product peek /
  Variant B orb on gradient with mono chips) → **AgentStage**.
- **How it works** — 3× `StepCard` (Pick/upload a doc → Talk in browser → Get a booking + report) →
  **DocUploader**; `StepConnector` (desktop dashed arrows).
- **What makes this serious** — 5× `FeatureCard` (Live tracing → **TraceWaterfall**, Provider leaderboard, Eval
  harness, $40 budget guard, Guardrails) each with a static SVG mini-glyph + hover "View →" route;
  `BudgetGuardTeaser` slim live bar → **BudgetMeter**.
- **Recent calls** — `RecentCallTicker` (marquee desktop / list mobile, anonymized pills) → **CallTimeline**.
- **Privacy trust line** — `TrustBand` (4 icon+label items).
- **Footer** — `FooterBlock` (brand, condensed nav, "Built with Next.js · Convex · VAPI", optional CTA repeat).

**Interactions.** Nav blur on scroll; live widgets update reactively; ticker auto-scrolls and pauses on hover;
cards lift on hover; all motion gated behind reduced-motion (fade not slide). Hero orb breathes; entrance stagger
~150ms.

**Primary actions.** Talk to a receptionist (→ `/try`) · See how it works (scroll) · explore a feature card · See
all recent calls (→ `/calls`) · toggle theme.

**States.** *Loading:* live widgets show skeletons (connecting dot, shimmer budget track, placeholder pills);
static marketing renders immediately. *Empty:* ticker → friendly empty + inline Talk button; chip → "Idle — be
the first today"; budget "$0.00 / $40." *Error:* live widgets fail silent-graceful (chip → "Live demo," ticker →
"See all recent calls →," budget hides bar) + optional sonner; CTA never gated. *Special:* budget reached → CTA
disabled "Demo budget reached for today — back tomorrow," meter at-cap; demo busy → hint "you may be placed in a
short queue."

**Data:** `budget.getPublicState`, `calls.activeCount`, `calls.countToday`, `calls.listRecentAnonymized`. VAPI
SDK NOT initialized here.

---

### 3.2 Try It — Mission Control — `/try`

**Purpose.** The hero product screen and core thesis-proof: a 3-column live control room where an anonymous
visitor picks/uploads a doc, configures an STT+TTS+LLM pipeline, and talks live in-browser to a doc-grounded
receptionist while watching real-time observability render with zero added latency. Reach a booking + report in
<2 min, no signup, while making the engineering visible. Owns consent, mic permission, and every guard/limit
state.

**Layout overview.** Top nav + thin global status strip; full-bleed 3-col grid ~28%/44%/28%. **LEFT = Setup**
(DocUploader → ingestion → Business Profile → PipelineSelector). **CENTER = Live Stage** (AgentStage →
CallController → CallTimeline). **RIGHT = Live Trace** (TraceWaterfall → ToolCallInspector → BudgetMeter →
guardrails → CostBreakdown). Above fold: 3 headers, orb, Talk button, first waterfall turn, BudgetMeter. Rails
scroll independently; consent/guard states render in-context, never as a separate route.

**Sections & key components.**
- **TopNav + `GlobalStatusStrip`** — "2 of 3 lines live · est. $12.40/$40 today · you have 2 calls left today";
  mono numerals turn amber/red near caps.
- **LEFT Setup** — `DocUploader` (drag-drop PDF/DOCX/TXT + 3 preset cards: Dental/Salon/Law) → **DocUploader**;
  `IngestionProgress` (Uploading→Parsing→Extracting→Indexing→Ready); `BusinessProfilePreview` (companyName, hours,
  services chips, policies, "12 chunks indexed"); `PipelineSelector` (independent STT/TTS+voice/LLM, Fal.ai
  "Custom adapter" badge, sample-clip play, "swapping restarts the call") → **PipelineSelector**.
- **CENTER Live Stage** — `AgentStage` (amplitude-reactive orb, lang badge, idle/speaking/listening/connecting)
  → **AgentStage**; `CallController` (Talk/End, mute, status pill, 120s countdown ring, "View call report →") →
  **CallController**; `CallTimeline` (streaming speaker turns + system events, interim greyed → solidifies,
  auto-scroll + jump-to-live) → **CallTimeline**; `ConsentGate` (first-call modal); `MicPermissionPrompt`.
- **RIGHT Live Trace** — `TraceWaterfall` (per-turn STT→LLM→tool→TTS spans + time-to-first-word) →
  **TraceWaterfall**; `ToolCallInspector` (lookup_knowledge / check_availability / book_appointment, firing
  pulse, PII-masked JSON); `BudgetMeter` (est. vs $40 + $8/day marker, reconciles on end) → **BudgetMeter**;
  `GuardrailIndicators` (injection / hallucination / stay-in-role / abuse chips); `CostBreakdown` (stt/llm/tts/
  platform ticker) → **CostBreakdown**.
- **Guard panels** — `DemoBusyPanel` (queue position), `LimitReachedPanel` (2/day, resets midnight),
  `BudgetReachedPanel` ($40/$8 framed as a feature).

**Interactions.** Talk → `canStartCall()` → consent (first call) → mic → connecting → live; pipeline change while
live → restart confirm; 120s auto-end; mid-call BudgetMeter labeled "est." then snaps to authoritative cost on
end. Observability rendered off the audio critical path.

**Primary actions.** Pick/upload doc · choose STT/TTS/LLM · acknowledge consent + grant mic · start/mute/end call
· watch live trace · proceed to report.

**States.** *Loading:* 3 column scaffolds; presets pre-ingested/instant; CallController disabled until doc
selected; rails captioned "Trace appears once the call starts." *Empty:* center/right dimmed with guiding caption;
purposeful empty placeholders, not blank boxes. *Error:* ingest-fail step turns red + retry; mic denied panel +
re-enable how-to; connection drop → "reconnecting…" banner → resume or graceful end into partial report.
*Special:* consent gate, mic prompt, 3 guard panels, 120s cap, PII redaction shown, reduced-motion orb fallback.

**Data:** `calls.activeConcurrency`, `budget.getState`, `visitorUsage.getForVisitor`, `canStartCall`,
`businesses.listPresets`, `documents.ingest`/`businesses.getIngestionStatus`, `businesses.getProfile`,
`providers.listRegistry`, **VAPI Web SDK events** (transcript/message/tool-calls/speech/volume/call-start/end,
local state off critical path), `telemetry.batchWriteSpans` (debounced fire-and-forget), `calls.getByVapiId`
(post-end reconcile).

---

### 3.3 Post-Call Report — `/call/[id]`

**Purpose.** A polished, revisitable two-column post-call dashboard delivered the moment a call ends: LEFT proves
business value (summary, structured booking + .ics, intent/lead, success badge, voice rating), RIGHT makes
engineering credible (authoritative waterfall from VAPI end-of-call report, cost breakdown, synced replay,
quality metrics). The payoff that converts a casual demo into "ships production-grade voice AI."

**Layout overview.** Sticky nav → full-width header strip (business + provider chips + duration + total cost +
langs + status) → responsive 2-col grid (LEFT ≈40% outcome / RIGHT ≈60% engineering) → sticky footer action bar.
Above fold: header + summary + waterfall.

**Sections & key components.**
- **Header strip** — `BusinessIdentityBlock` (H1 + "Grounded in: glow-dental-faq.pdf" side-sheet link + status
  pill), `ProviderChips` (STT/LLM/TTS, click → cross-highlight span/cost row), `MetaMetricCluster` (duration,
  total cost accented, langs, timestamp).
- **LEFT** — `SummaryCard` ("What the caller wanted," 3–5 bullets anchoring to transcript) + `SentimentTone`;
  `BookingCard` (key/value rows + per-field confidence dots + tentative tag), `IcsDownloadButton`,
  `EmailInviteField` (one-off, not stored); `IntentCard` (intent + lead-quality chip + entity tags + suggested
  follow-up); `SuccessBadge` (pass/partial/fail + rubric expand), `VoiceRatingStars` (★ → leaderboard, locks after
  one vote).
- **RIGHT** — `TraceWaterfall` (authoritative per-turn, time-to-first-word marker, turn stepper, aggregate/
  per-turn toggle) → **TraceWaterfall**; `CostBreakdown` (stt/llm/tts/platform, sums to header, absolute/percent
  toggle) → **CostBreakdown**; `SessionReplay` (audio scrubber + auto-follow transcript + event markers, speed
  control, space=play) → **SessionReplay**; `QualityMetricGrid` (talk-ratio, interruptions, dead-air, WPM,
  sentiment, benchmark colors).
- **Footer bar** — `TryAnotherCallCTA` (→ `/try` with doc preselected; disabled "limit reached today" when
  capped) → **CallController**; `LeaderboardRecentLinks` (deep-link + highlight) → **LeaderboardTable**.

**Interactions.** Cross-highlight chip ↔ waterfall span ↔ cost row; summary bullet / transcript line / event
marker all seek SessionReplay; .ics download toast; voice rating optimistic + locks; header cost count-up; cards
"assemble" via staggered skeleton→content crossfade.

**Primary actions.** Download .ics · Email invite · Rate voice (★) · Replay call · Try another call · jump to
Leaderboard/Recent Calls.

**States.** *Loading:* header renders immediately ("Processing report…"); right cards shimmer ("Waiting on VAPI
end-of-call report…"); replay "Preparing audio…"; reactive auto-fill; >30s reassurance note. *Empty:* no booking
→ BookingCard collapses, IntentCard promoted to top, .ics/email hidden; short call → "limited summary"; no audio →
"No recording available." *Error:* status "Error" + non-blocking card "couldn't finish processing" + Retry +
Try-another fallback; partial data still renders; expired id (>24h) → dedicated "This call has been purged" page.
*Special:* 24h-purge note + redacted-span "[redacted]" chips; purge-imminent banner; rating locked after one vote;
"Ended at 120s call cap" badge.

**Data:** `calls.getById`, `calls.getReportStatus`, `summaries.getByCallId`, `bookings.getByCallId`,
`intents.getByCallId`, `evals.getSuccessEvaluation`, `trace.getWaterfall`, `cost.getBreakdown`,
`replay.getSession`, `quality.getMetrics`, `ratings.submitVoiceRating`, `bookings.generateIcs`,
`bookings.emailInvite`, `calls.retryReportProcessing`, `leaderboard.getRowForCall`.

---

### 3.4 Leaderboard — Provider Benchmarking — `/leaderboard`

**Purpose.** Turn real call telemetry into a credible provider-benchmarking surface (Datadog/Vercel-grade): how
each STT/TTS/LLM ranks on latency (time-to-first-word), cost/min, and human-rated quality, shown as a latency×cost
quadrant scatter (bubble size = quality) plus dense sortable tables. Signature flex: the custom Fal.ai/OSS adapter
ranked head-to-head against native VAPI providers.

**Layout overview.** Single scroll, max ~1440px. Header row (title + freshness chip + filter bar + Quadrant/Tables
emphasis toggle). Above fold: full-width Quadrant card (~520px) with LatencyCostChart + 4 labeled quadrants +
Fal.ai callout + legend rail. Below: tabbed STT|TTS|LLM ranking tables (or "Stack all"). Sticky filter sub-header
on scroll; methodology disclosure strip.

**Sections & key components.**
- **Header** — `PageTitleBlock`, `FreshnessChip` ("Updated 2m ago · 1,284 calls," reactive pulse), `FilterBar`
  (Language / Business / Source [All·Native·Custom], URL-synced), `EmphasisToggle` (Quadrant/Tables, localStorage).
- **Quadrant** — `LatencyCostChart` (x=p50 TTFW, y=cost/min, z=★; STT●/TTS▲/LLM◆; median crosshairs; custom-adapter
  accent ring) → **LatencyCostChart**; `QuadrantLegendRail` (shape key + p50/p95 axis toggle); `FalAdapterCallout`
  (pinned annotation + connector line + "Why this matters"); `SampleDataBadge` (amber, hatched fills in low-volume).
- **Tables** — `TableEmphasisTabs` (STT|TTS|LLM + Stack all, URL-synced); `LeaderboardTable` (provider+logo, source
  pill Native/Custom✦, p50/p95 latency, cost/min, ★+count, calls, language flags, examples link; rank medals
  top-3; custom rows accent left-border; best-in-column highlighted; row-expand drawer with cost bars + rating
  dist + language split) → **LeaderboardTable**; `ExampleCallsPopover` (up to 5 calls → report/replay);
  `NativeVsCustomCallout` (dismissible banner).
- **Methodology** — `MethodologyDisclosure` (latency=TTFW p50/p95, cost from end-of-call reports, ★ from visitor
  ratings, rolling 30d, min 5 calls).

**Interactions.** Bubble hover → rich tooltip; click bubble → scroll+highlight table row + examples popover; legend
mutes series; p50↔p95 re-tweens bubbles + crosshairs; filters re-query with 200ms crossfade, URL-synced/shareable;
column-sort with sticky header; row hover reveals latency sparkline.

**Primary actions.** Toggle Quadrant/Tables · filter (lang/business/native-vs-custom) · sort tables · drill
bubble/row → example calls/reports · inspect Fal.ai adapter head-to-head.

**States.** *Loading:* shimmer plane + axis labels + "Aggregating provider stats…"; 6–8 skeleton rows; no layout
shift. *Empty (low volume):* "Sample data" mode — seeded hatched points + amber badge + banner ("…numbers go live
after 5+ calls per provider. Try It →"). *Error:* inline error card + Retry + "last cached snapshot 12m ago"
fallback; tables degrade to cached. *Special:* filter-yields-nothing ("No providers match these filters" + Clear);
custom-adapter-warming note; mixed real+sample → per-row "sample" tag.

**Data:** `providerStats.list` (filtered), `providerStats.lastUpdated`, `calls.exampleCallsByProvider`,
`voiceRatings.distributionByProvider`, `businesses.listPresets`, `calls.languageFacets`; derived `sampleMode`
flag; searchParams `kind/language/business/source/emphasis/sort`.

---

### 3.5 Analytics Dashboard — `/analytics`

**Purpose.** Production-grade observability of the whole demo's aggregate health — volume, latency percentiles,
cost vs $40/$8 guards, success/outcome rates, language mix, breakdowns by business/provider/outcome/sentiment.
Reads like a real ops dashboard (Grafana/Vercel-class), reuses the leaderboard's chart language, makes the spend
guard accountable. Convex-reactive: updates live as calls complete.

**Layout overview.** Top nav → sticky header (title + live pulse + DateRangeControl + granularity toggle). 12-col
grid: Region 1 = 6 KPI tiles; Region 2 = two-up time-series (Calls over time | Latency trend) + full-width Daily
spend vs caps with $8/$40 reference lines; Region 3 = 2×2 breakdown cards (business / provider pairing / outcomes /
sentiment).

**Sections & key components.**
- **Header** — `DateRangeControl` (24h/7d/30d/All/Custom popover, URL-synced, default 7d), `GranularityToggle`
  (Hourly/Daily, hourly disabled >7d), `LiveStatusPill` (pulsing dot, "Reconnecting…" on drop).
- **KPI tiles** — Total calls, Latency p50/p95 (uses leaderboard latency tokens), Avg cost/call, Success rate,
  Language mix (stacked bar), and Spend tile with `BudgetMeter` ($23.40/$40 + $8/day, amber ≥80% → red at cap) →
  **BudgetMeter**. Each tile: value + delta chip + sparkline; click deep-links Recent Calls.
- **Time-series** — `CallsOverTimeChart` (area/stacked-by-outcome toggle), `LatencyTrendChart` (p50/p95 multi-line
  + band + target reference) → **LatencyCostChart** language, `DailySpendVsCapsChart` (daily bars + cumulative line
  + dashed $8 + solid red $40, over-cap bars amber).
- **Breakdowns** — `CallsByBusinessBars` (anonymized upload labels + success-rate pill), `ProviderPairingBars`
  (STT→TTS, latency+cost chips, → Leaderboard) → **LeaderboardTable** styling, `OutcomeDistribution`
  (booked/intent/abandoned), `SentimentDistribution` (donut/diverging).

**Interactions.** Date-range re-scopes all queries (skeleton shimmer); click bucket/segment cross-filters
dashboard + deep-links Recent Calls; live count-up + one-shot highlight on changed tiles; BudgetMeter animates
fill.

**Primary actions.** Adjust range/granularity · drill into Recent Calls · cross-filter by
business/provider/outcome/sentiment/language · watch live updates · hand off to Leaderboard.

**States.** *Loading:* full skeleton parity (6 KPI shimmer tiles, axis-skeleton charts, breakdown bar skeletons);
nav + date control stay interactive; no layout shift. *Empty:* "No calls in this window yet" + "Try the demo"/
"Widen range"; KPI tiles show "—" (grid never collapses); per-card "Not enough calls…". *Error:* top banner
"Couldn't load analytics — retrying…" + Retry + pill "Reconnecting…"; per-chart contained error + small Retry;
stale labeled "Showing last known values." *Special:* budget states first-class — meter amber ≥80% → red "Budget
reached — new calls blocked," spend chart clamps at $40, daily over-$8 bars amber; live figures "est., reconciled
on call-end"; anonymized upload labels; 24h-purge header note.

**Data:** `analytics.getKpis`, `getCallsTimeSeries`, `getLatencyTimeSeries`, `getSpendTimeSeries`,
`budget.getBudgetState`, `analytics.getBreakdownByBusiness`, `getBreakdownByProviderPairing`,
`getOutcomeDistribution`, `getSentimentDistribution`, `getLanguageMix`; searchParams
`from/to/preset/granularity/businessId?/outcome?/sentiment?/lang?`.

---

### 3.6 Recent Calls Wall — `/calls`

**Purpose.** Prove the demo is alive and used via a realtime, fully-anonymized feed. Each card is a credibility
artifact (business, exact STT/TTS/LLM pipeline, duration, outcome, total cost, language, trace sparkline). New
calls animate in live; cards launch into the Post-call Report. When empty, convert the visitor into the first
caller.

**Layout overview.** Single centered column, max ~1200px. Header (title + reactive 24h counter + pulsing dot +
"Anonymized" chip) → sticky filter bar (Outcome/Business/Provider + result count + grid/list toggle) → responsive
masonry grid (3 desktop / 2 tablet / 1 mobile). New cards insert at top with highlight-in; "live updates paused"
pill on scroll; infinite-scroll footer + persistent anonymization/24h disclosure.

**Sections & key components.**
- **Header** — `PageTitle`, `LiveCounter` (reactive 24h count, number-roll, amber dot on reconnect),
  `AnonymizationChip` (popover: names/phones/emails redacted, 24h purge).
- **Filter bar** — `OutcomeFilter` (All/Booked/Intent/Abandoned chips), `BusinessFilter` (combobox),
  `ProviderFilter` (grouped by kind, shared leaderboard vocabulary), `ResultCountAndClear`, `ViewToggle`
  (grid/list, URL-synced).
- **Grid** — `CallCard` (business + outcome badge + 3 provider chips + metadata row + trace sparkline footer; whole
  card → `/calls/[id]`); `OutcomeBadge`; `ProviderChips` (matches Leaderboard colors); `TraceSparkline` (recharts,
  nod to **TraceWaterfall**); `NewCardHighlight` (insertion ring ~1.5s).
- **Live control** — `PausedUpdatesPill` ("3 new calls · jump to top," batches inserts).
- **Footer** — `LoadOlderCalls` (cursor pagination + sentinel), `AnonymizationDisclosure`.

**Interactions.** Click card → report; filters update searchParams + reactive query; time-ago auto-ticks; hover
lift + "View report →"; sparkline draws in on arrival; reduced-motion → fade only.

**Primary actions.** Open report · filter (outcome/business/provider) · toggle grid/list · jump-to-top to flush
buffer · load older · empty-state CTA → Try It.

**States.** *Loading:* 6–9 skeleton cards (name/3 chips/metadata/sparkline); filter bar visible but disabled;
counter skeleton; no shift. *Empty:* "No calls yet today." + "Be the first…" + "Try it now →"; filter-empty
variant → "No calls match these filters." + Clear. *Error:* inline error card "Couldn't load recent calls." +
Retry + "reconnect automatically"; transient drop → amber dot + sonner, grid not wiped. *Special:* live-paused (no
auto-shift, pill surfaces count); mid-session purge → card fades out gracefully (no broken link); reduced-motion →
fades.

**Data:** `calls.listRecent` (reactive cursor-paginated), `calls.countLast24h`, `businesses.listForFilter`,
`providerStats.listProviders`, `spans.sparklineForCall`; nav target `/calls/[id]` → `calls.getReport`.

---

### 3.7 Evals — `/evals`

**Purpose.** Make engineering rigor maximally legible: prove the receptionist is held to scripted, scored,
regression-tracked quality bars. Visitors pick a config, run simulated-caller scenarios (FAQ-from-doc accuracy,
booking flow, prompt-injection resistance, off-doc refusal, multilingual), and see per-scenario pass/fail with
task-success, grounding, and latency. Centerpiece: a red/green regression diff vs a baseline ("changed model X → 2
regressions"), backed by run history + per-case detail drawer. The screen that says "I do eval-driven
development."

**Layout overview.** Top nav → header band (title + subtitle + right-aligned RunConfigBar: STT/TTS/LLM/Business +
"Run evals"). Desktop 12-col: LEFT sticky 4/12 Run History; RIGHT 8/12 workspace — (1) Regression Summary banner,
(2) Score Overview strip, (3) `<EvalResults>` scenario table. Row click → right-side detail Drawer (~520px). Empty
state replaces right area with Scenario Catalog + "Run your first eval."

**Sections & key components.**
- **Header / RunConfigBar** — inline `PipelineSelector` (STT/TTS/LLM, dirty-config hint) → **PipelineSelector**;
  `BusinessSelector`; `RunEvalsButton` (disabled when budget tripped / run in flight, streams rows reactively);
  `BaselineCompareToggle` (recomputes diff reactively).
- **Run History (left)** — `RunHistoryList` (config chips + business + timestamp + pass ratio + status dot, active
  highlighted, baseline tagged, "Set as baseline" hover); `RunFilter` (All/Passed/Has regressions + business).
- **Regression Summary** — `RegressionDiffBanner` (red/green/neutral, count of regressions+improvements, one-line
  "what changed" config diff, "View N regressions" filters table) — most load-bearing visual.
- **Score Overview** — `ScoreKpiTiles` (pass rate, avg grounding, p50 latency, regressions; deltas vs baseline).
- **Scenario table** — `EvalResults` (scenario, category badge, PASS/FAIL pill, task-success, grounding, latency,
  Δ-vs-baseline; regressed rows red left-border + tint; streams live with per-row spinner) → **EvalResults**;
  `ScenarioCategoryLegend`.
- **Detail Drawer** — `CaseScriptPanel`, `ExpectedVsActualDiff` (mismatches red, inline/side-by-side),
  `CallTimeline` (simulated call transcript+events) → **CallTimeline**, `JudgeRationalePanel` (per-metric, cited
  chunks), `CaseDrawerFooter` (baseline compare + "Re-run this case").
- **Empty body** — `ScenarioCatalogCards` (5 families + pass criteria), `EmptyStateRunCTA`.

**Interactions.** Run → batch + reactive streaming; change baseline → banner + deltas recompute; row → drawer;
"regressions only" filter; re-run single case; new runs appear live at top.

**Primary actions.** Run evals · select baseline · open scenario detail · filter to regressions only · re-run a
failing case.

**States.** *Loading:* (a) page → skeleton run cards + KPI tiles + table rows; (b) running → progress header
("Running 5 scenarios · 2 of 5 · ~14s") + determinate bar + rows streaming (queued spinner → running →
PASS/FAIL), KPI tiles tick up, button spinner. *Empty:* Scenario Catalog + "No eval runs yet." + "Run your first
eval"; rail hint "Runs you trigger will appear here." *Error:* (a) budget tripped → "Budget reached today — evals
paused…"; (b) per-case "errored" amber pill + "Retry case" (distinct from red FAIL), partial results; (c)
whole-run error card + Retry; (d) no baseline → neutral "First run for this config." *Special:* same $40/$8 guard
gates runs (LLM-judge costs money); dirty-config "Run to compare"; stale-baseline caution chip ("Baseline used a
different doc"); live cross-tab updates.

**Data:** `evals.listRuns`, `getRun`, `getRegressionDiff`, `listScenarios`, `getCaseDetail`, `evals.startRun`,
`rerunCase`, `setBaseline`, `budget.getGuardState`, `businesses.listForSession`, `providers.listRegistry`.

---

### 3.8 Admin Control Room — `/admin` (private, env-gated)

**Purpose.** Operator console exposing what public screens hide: live spend vs hard caps, real-time guard status,
a complete searchable call log, eval-run history, a destructive "force the guard" hard-stop test, and
retention/purge status. Deliberately utilitarian NOC view. Answers "are we about to blow the budget?", "is the
guard working?", "did the purge run?" — and lets the operator intervene (manual purge, force-stop).

**Layout overview.** Two top-level states. **STATE A (unauthorized):** centered secret-gate card on bare canvas,
no nav. **STATE B (authorized):** slim operator top bar (mono "ADMIN," env badge, connection dot, last-refresh,
Lock, theme) → dense 12-col single-scroll. Above fold: 4–6 KPI/guard tiles, then 2/3 (Spend dashboard) + 1/3
(Guard Status over Danger Zone). Below: full-width Call Log → Eval Run History → Retention strip. All reactive;
monospace numbers, tabular alignment.

**Sections & key components.**
- **Secret Gate** — `SecretGateCard` (lock icon, single token input + show/hide, Unlock, server-verified env
  secret → short-lived httpOnly cookie; invalid → shake + clear; 5 fails → 60s throttle). Not a login (no
  email/forgot/signup).
- **Operator top bar** — `AdminTopBar` (env pill amber preview / red-tinted prod, Convex connection dot Live/
  Reconnecting/Disconnected, ticking last-updated, Lock → gate + "Locked" toast, theme).
- **KPI/Guard tiles** — `StatTile ×N` (global spend $31.20/$40, today, active calls, calls-near-cap, last purge,
  eval pass rate; accent neutral→amber ≥75%→red ≥90%; click anchors to its panel).
- **Spend dashboard (2/3)** — `BudgetMeter` (dual-track global+daily, threshold ticks 75/90/100%, "BUDGET
  REACHED — new calls blocked," reads authoritative `budgetState`) → **BudgetMeter**; `SpendHistoryChart` (14d
  daily bars + dashed $8 cap, cap-hit days danger color, 7/14/30d toggle); `CostBreakdown + PerCallCostLog`
  (sortable per-call: time, call ID copy, stt/tts/llm/platform, total, contribution; row-expand → **CostBreakdown**
  detail; anomalously-high warning accent) → **CostBreakdown**.
- **Guard Status (1/3 top)** — `GuardStatusPanel` (rows: global $40, daily $8, concurrency 3, per-visitor 2/day;
  current/threshold + headroom bar + OK/NEAR/AT-CAP/BLOCKED chip; nested searchable per-visitor list with
  truncated visitorKey + blocked flag).
- **Danger Zone (1/3 bottom, red-bordered)** — `ForceGuardControl` (flips server override so `canStartCall()`
  fails → proves hard-stop without spending to $40; confirm dialog; persistent "GUARD FORCED" banner + Release);
  `ManualPurgeControl` (runs the 24h cron purge; typed "PURGE" confirm dialog listing target tables + estimated
  counts; progress → result toast).
- **Call Log (full-width)** — `CallLogTable` (dense, sortable, virtualized; status chip live/ended/failed/blocked;
  cost mono; STT/TTS·voice; success dot; guardrail count badge; truncated visitorKey; search + multi-filter; row →
  inline summary or "View trace ↗" → **TraceWaterfall**/**SessionReplay**; live calls update in place) →
  **CallTimeline**.
- **Eval Run History (full-width)** — `EvalResults (history mode)` (one row per run: timestamp, trigger, config,
  pass/total, score, Δ-vs-prev green▲/red▼, p50 latency; regressions red; row-expand → per-case diff; running-row
  shimmer) → **EvalResults**.
- **Retention strip (footer)** — `RetentionStatusStrip` (last cron run + OK/failed + counts purged + time-to-next +
  pending-past-TTL; failed/stale → red + "Run purge now" → Danger Zone).

**Interactions.** Tiles anchor-scroll; meters animate on reactive ticks; tables sort/search/filter via indexed
queries; force-guard reflects live across tiles + Guard Status ("FORCED" chip); manual purge updates retention
strip live; call ID click copies.

**Primary actions.** Unlock with token · force the budget guard ON/OFF · run manual purge (typed-confirm) ·
filter/search/sort call log + open trace/replay · inspect per-call cost + spend history · lock + toggle theme.

**States.** *Loading:* skeleton rows/tiles/meters + "Connecting to live data…"; gate button spinner "Checking…".
*Empty:* tiles $0.00/$40, 0/3; flat spend baseline; "No calls have incurred cost yet." / "No calls yet — start one
from Try It." / "No eval runs yet."; guard all OK full headroom; "Purge has not run yet — scheduled";
filtered-empty + Clear. *Error:* connection dot red "Disconnected" + dismissible banner + Retry; affected panels
show "Couldn't load — retry" (never stale money as live); action errors → red inline + toast + retry (failed purge
keeps dialog open); gate network error "Couldn't verify token." *Special:* (1) unauthorized default — console never
rendered/fetched until server validates; (2) throttled gate 60s; (3) GUARD-FORCED banner + FORCED chips + meter
"BUDGET REACHED (forced)"; (4) real budget-reached meters lock red + "AT CAP/BLOCKED"; (5) purge-stale/failed red;
(6) preview vs prod env badge; (7) typed "PURGE" + force-guard confirm.

**Data:** `budget.getState`, `budget.spendByDay`, `calls.costLog`, `calls.list` (indexed/filterable),
`visitorUsage.today`, `guard.status` (incl. forced-flag), `evalRuns.history`, `purge.status`, `admin.verifyToken`
(throttled), `admin.lock`, `admin.forceGuard`, `purge.runNow`, Convex websocket connection state.

---

## 4. Stitch Generation Guide

Paste each prompt into **Google Stitch** in this order. Generate **light + dark** and **desktop + mobile** per
screen. After Stitch, take the output into **Lovable/shadcn** to produce React components, then wire to the
**Convex + VAPI** backend. **Skip Lovable Cloud / Stripe steps** — the backend is Convex (reactive data +
actions) and the VAPI Web SDK (voice); there is no auth, no payments, no signup.

**Order: foundation first, then read-surfaces, then the live loop, then admin.**

**0. Foundation / Design System** — "Generate a production-grade design-system foundation for a
'calm-but-technical' voice-AI receptionist demo: slate neutrals with a single indigo/violet accent, full
light+dark parity, Geist Sans UI with mono for all numbers/latencies/costs. Show the 56px blurred top nav
(wordmark + Try It/Leaderboard/Evals/Analytics/Recent Calls + live budget mini-pill + light/dark toggle), a slim
compliance footer, provider brand chips, and the frozen status badges (idle/connecting/live/ended,
booked/intent/abandoned, pass/fail) plus the shared latency×cost color scale. Render the reusable LOADING
skeletons, EMPTY-with-CTA, ERROR-with-retry, and the calm guard/limit states (demo busy, 2-calls-used, budget
reached, mic permission, recording consent) side-by-side in both themes, all built on shadcn/ui + Tailwind v4 with
AA contrast and reduced-motion support."

**1. Landing (`/`)** — "Design a calm, production-grade dark-and-light landing page for a document-grounded AI
voice receptionist demo aimed at engineers and employers. Sticky minimal top nav (wordmark, links Try
It/Leaderboard/Evals/Analytics/Recent Calls, theme toggle, accent CTA 'Talk to a receptionist'); a confident hero
with a mono eyebrow, two-line headline 'Talk to an AI receptionist that actually knows the business,' subtext, two
CTAs, a tiny pulsing live-calls chip, and a softly-framed product peek of a 3-column mission-control with a glowing
agent orb. Below: a 3-step 'how it works' row, a 5-card 'built like production' engineering strip (live tracing,
provider leaderboard, eval harness, $40 budget guard, guardrails) each with a tiny static viz glyph, a realtime
anonymized 'recent calls' ticker of pipeline pills, a slim privacy trust band, and a multi-column footer.
Near-monochrome neutral palette with one restrained accent, generous whitespace, mono technical labels —
instrumented and serious, never salesy; no pricing."

**2. Try It — Mission Control (`/try`)** — "Design a polished, production-grade 3-column 'mission control' for a
live AI voice receptionist demo, light+dark parity, responsive. LEFT rail: a drag-drop document uploader with
three preset business cards (dental clinic, salon, law office), a stepped ingestion progress indicator, an
extracted Business Profile card (company name, hours, services chips), and a Voice Pipeline selector with
independent STT/TTS-voice/LLM dropdowns showing per-provider cost-per-minute and a 'changing restarts the call'
notice. CENTER: a large amplitude-reactive glowing orb/waveform agent stage with a detected-language badge, a big
Talk/End call button with mute and a 120-second countdown ring and status pill (idle/connecting/live/ended), and a
streaming speaker-turn transcript below. RIGHT rail: a per-turn latency waterfall (STT→LLM→tool→TTS with
time-to-first-word), a live tool-call inspector (lookup_knowledge/check_availability/book_appointment), a budget
meter 'est. $12.40/$40' with a daily $8 sub-cap, guardrail status chips, and a per-component cost ticker.
Sophisticated dark control-room aesthetic with monospace numerals, subtle accent glows, a consent/recording
disclosure modal, and graceful 'demo busy / daily limit reached / budget reached' panels."

**3. Post-Call Report (`/call/[id]`)** — "Design a polished, production-grade two-column post-call analytics
dashboard for an AI voice receptionist, light and dark parity. Top: a full-width header strip with business name,
three provider chips (STT/LLM/TTS), duration, total cost, and language badges plus a status pill. Left column
(outcome): an 'AI summary' card with 3–5 reflective bullets, a structured 'Booking captured' card with a primary
'Download .ics' button and an 'Email me the invite' control, a captured-intent/lead card, a success-evaluation
badge, and a 5-star 'rate this voice' control. Right column (engineering): a per-turn latency waterfall with a
time-to-first-word marker, a stacked cost-breakdown bar (stt/llm/tts/platform), an audio session-replay scrubber
with a synced scrolling transcript and event markers, and a grid of quality-metric tiles (talk-ratio,
interruptions, dead-air, WPM, sentiment). Use shadcn cards, subtle accent on cost, recharts-style charts, and a
sticky footer with a primary 'Try another call' button and leaderboard/recent-calls links; include tasteful
skeleton-loading states."

**4. Leaderboard (`/leaderboard`)** — "Generate a polished dark-and-light analytics 'Provider Leaderboard' for a
voice-AI demo. Top: a large latency-vs-cost scatter (x=time-to-first-word ms, y=cost/min) with bubbles sized by
star rating, split into four labeled quadrants ('fast & cheap', 'premium', etc.), distinct marker shapes for
STT/TTS/LLM, and a pinned callout highlighting a custom 'Fal.ai' adapter bubble versus native providers. Below: a
tabbed (STT|TTS|LLM) dense sortable ranking table with columns for provider+logo, a Native/Custom source pill,
p50/p95 latency, cost/min, star rating, call count, language flag chips, and a 'view calls' link — top-3 rows
medal-accented, custom-adapter rows with an accent left border. Include a filter bar (language, business,
native-vs-custom), a Quadrant/Tables emphasis toggle, a live 'updated 2m ago · 1,284 calls' freshness chip, and an
amber 'Sample data' badge variant; make it feel like a production Datadog/Vercel-grade dashboard with tasteful
density."

**5. Analytics (`/analytics`)** — "Generate a production-grade observability dashboard at /analytics for a
voice-AI demo, in the visual language of Grafana/Vercel Analytics but warmer and polished, full light/dark parity.
Top: a sticky header with title 'Analytics', a live pulsing status pill, and a right-aligned segmented date-range
control (24h/7d/30d/All/Custom) plus an Hourly/Daily toggle; below it a row of six KPI tiles (total calls, latency
p50/p95, avg cost/call, success rate, language mix as a stacked bar, and a spend tile with a $23.40/$40 budget
meter), each with a delta chip and sparkline. Middle: two side-by-side recharts cards — calls over time
(area/stacked-bar) and latency trend (p50/p95 multi-line) — then a full-width daily-spend chart with dashed $8/day
and solid red $40 reference lines. Bottom: a 2x2 grid of breakdown cards (calls by business and by provider
pairing as horizontal ranked bars, outcomes booked/intent/abandoned, and sentiment distribution as donuts). Use
shadcn cards with subtle borders, lucide icons, a restrained accent palette consistent across all charts, generous
whitespace, and include skeleton-loading and empty ('No calls in this window yet') variants."

**6. Recent Calls (`/calls`)** — "Design a polished, production-grade 'Recent Calls' wall for an AI
voice-receptionist demo, light and dark parity. Under a persistent top nav, show a centered page header with a
title, a pulsing green 'live' counter ('47 calls in the last 24h'), and an 'Anonymized' info chip, then a sticky
filter bar (Outcome chips: Booked/Intent/Abandoned, plus Business and Provider selects, and a grid/list toggle).
Below, render a responsive 3-column grid of compact call cards — each with a business name, a color-coded outcome
badge, three small provider chips (STT/TTS/LLM), a metadata row (duration, total cost, language, time-ago), and a
tiny trace sparkline footer — with new cards subtly highlighted as they animate in. Keep it elegant and scannable
using shadcn/ui, Tailwind, lucide icons, and recharts sparklines, and include skeleton-card loading and a 'be the
first to try it' empty state."

**7. Evals (`/evals`)** — "Generate a polished, production-grade dark-and-light eval dashboard for a voice-AI
product, Linear/Vercel aesthetic with shadcn/ui + Tailwind, lucide icons, recharts. Layout: persistent top nav
with 'Evals' active; a header row with three pipeline dropdowns (STT/TTS/LLM) plus a business dropdown and a
primary 'Run evals' button; a sticky left run-history rail of run cards (config chips, timestamp, pass ratio,
colored status dot); and a right results workspace showing a bold red/green Regression Summary banner ('2
regressions vs baseline — changed gpt-4o-mini → gpt-4o'), a strip of KPI tiles (pass rate, grounding, p50 latency,
regressions) with green/red deltas, and a sortable scenario results table with PASS/FAIL pills and a 'Δ vs
baseline' column where regressed rows have a red left border and red tint. Make regressions visually unmistakable.
Include a right-side detail drawer with Overview/Transcript/Judge tabs (expected vs actual diff, transcript
timeline, LLM-judge rationale), and an alternate empty state showing five scenario-family catalog cards with a 'Run
your first eval' CTA."

**8. Admin (`/admin`)** — "Design a dense, utilitarian internal operator dashboard ('Admin control room') for a
voice-AI demo — dark-mode-first, monospace numbers, NOC/observability aesthetic, deliberately less polished than
the marketing screens. Top: a slim ADMIN bar with an env badge and a green 'Live' status dot, then a row of
compact KPI tiles (global spend $31.20/$40 with a red-tinted progress meter, today $5.10/$8, active calls 2/3)
that turn amber/red near caps. Below, a two-thirds spend panel (dual budget meters + a 14-day spend bar chart with
a dashed $8/day cap line + a dense per-call cost log table) beside a one-third column holding a Guard Status list
(each rate-limit cap with a headroom bar and OK/NEAR/AT-CAP chips) above a red-bordered Danger Zone (a 'Force the
budget guard' toggle and a 'Purge now' button). Underneath, full-width sortable Call Log and Eval Run History
tables and a retention/last-purge status strip. Also show the alternate state: a bare centered 'Admin —
restricted' card with a single access-token password field and an Unlock button, no nav."

**Pipeline note.** Stitch screens → Lovable/shadcn React components → wired to Convex reactive queries/mutations/
actions and the VAPI Web SDK. Reuse the frozen `<Component>` contracts across screens so the engineering and
design stay consistent. Lovable Cloud / Stripe are intentionally skipped.

---

## 5. Screen → Build-Workstream Mapping

Dovetails with the parallel-build plan by grouping screens into three workstreams sharing the frozen component
contracts:

| Workstream | Screens | Nature | Key contracts |
|---|---|---|---|
| **Frontend read-surfaces** (reactive Convex queries only; no VAPI SDK) | Landing `/`, Leaderboard `/leaderboard`, Analytics `/analytics`, Recent Calls `/calls`, Post-Call Report `/call/[id]` | Marketing + analytics/observability dashboards rendered from persisted call telemetry; read-only, shareable, deep-linkable | `LeaderboardTable`, `LatencyCostChart`, `TraceWaterfall`, `CostBreakdown`, `CallTimeline`, `SessionReplay`, `BudgetMeter`, `EvalResults` |
| **Live call loop** (VAPI Web SDK + Convex; the realtime path) | Try It — Mission Control `/try`, plus the **Evals** `/evals` run engine (simulated-caller runs) | Mounts the SDK, drives the orb/transcript/trace off SDK events on the audio critical path's edge, owns consent/mic/guard gating and the $40 guard at call-start | `CallController`, `AgentStage`, `DocUploader`, `PipelineSelector`, `TraceWaterfall`, `CostBreakdown`, `BudgetMeter`, `CallTimeline`, `EvalResults` |
| **Admin / operations** (private, env-gated; authoritative state + interventions) | Admin Control Room `/admin` | NOC console reading authoritative `budgetState`/guard/purge state; houses force-guard and manual purge; never in public nav | `BudgetMeter`, `CostBreakdown`, `CallTimeline`, `EvalResults` |
| **Foundation** (cross-cutting; consumed by all three) | Design System `_foundation` | Tokens, app chrome (nav/footer), provider chips, status badges, latency×cost color scale, toast system, and the LOADING/EMPTY/ERROR + guard/limit templates every surface implements | App shell + all frozen contracts |

**Shared-contract discipline.** `BudgetMeter`, `TraceWaterfall`, `CostBreakdown`, and `EvalResults` each appear
across all three workstreams — build them once in the foundation layer with theme + reduced-motion +
loading/empty/error baked in, then compose. The Latency×Cost color scale and StatusBadge vocabulary are the
cross-screen glue ensuring a color or status always means the same thing whether a peer is on the Landing teaser,
the live trace, the Leaderboard quadrant, or the Admin call log.
