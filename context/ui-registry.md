# UI Registry

The component catalog. **Reuse what's here before building anything new.** Components are UI-only (no direct DB
calls); data arrives via Convex hooks or props. Built on shadcn-style primitives over Radix, styled to the
Signal Bold tokens in [ui-tokens.md](ui-tokens.md), Phosphor icons throughout.

---

## Providers & app shell

| Component | File | Purpose |
| --- | --- | --- |
| `Providers` | `components/providers.tsx` | Root provider stack — theme (`next-themes`), Convex, tooltip; wraps the app in `app/layout.tsx`. |
| `ConvexClientProvider` | `components/convex-provider.tsx` | `ConvexReactClient` over `NEXT_PUBLIC_CONVEX_URL`. |

## `components/layout/` — site shell

| Component | Purpose |
| --- | --- |
| `site-header.tsx` | Fixed top nav (`z-40`, safe-area, scrolled border/blur). Renders `OWNER_NAV`; `TECHNICAL_NAV` under "Behind the scenes" via `<TechnicalOnly>`. Hosts BudgetMeter (pill), ViewModeToggle, ThemeToggle, mobile Sheet. |
| `site-footer.tsx` | Footer links. |
| `theme-toggle.tsx` | Light/dark/system dropdown (Phosphor Sun/Moon/Monitor); `next-themes`. |
| `view-mode-toggle.tsx` | Owner↔technical toggle (Phosphor Wrench, `aria-pressed`; amber when technical). |

## `components/ui/` — primitives (shadcn-style over Radix)

`alert` · `avatar` · `badge` · `button` · `card` · `dialog` · `dropdown-menu` · `input` · `popover` ·
`progress` · `scroll-area` · `select` · `separator` · `sheet` · `skeleton` · `sonner` (toast) · `table` ·
`tabs` · `textarea` · `tooltip`.

Notes: `button` uses CVA variants (default/outline/secondary/ghost/destructive/link) + sizes (incl. `icon*`);
`card` has Header/Title/Description/Action/Content/Footer; depth is `border border-border` + shadow (the shadcn
`ring-1 ring-foreground/10` tell was removed). Primitives were hand-authored to tokens — see the shadcn note in
[code-standards.md](code-standards.md). Never let the shadcn CLI rewrite `globals.css`.

## `components/shared/` — reusable data/status

| Component | Purpose |
| --- | --- |
| `voice-visualizer.tsx` | Few-bar amber equalizer; `demo` (synthetic) / `live` (real `level`/`speaking`/`active`). Honesty rule in [ui-rules.md](ui-rules.md). |
| `appointment-card.tsx` | Chrome-less booking card (service/when/name/contact/notes) + real `.ics` via `/api/ics/[leadId]`. Reused on `/try`, the report, and chat. |
| `availability-calendar.tsx` | `AvailabilityCalendar` — read-only, live 14-day calendar (`api.calendar.getWindow`). Props: `businessId`, `offeredSlots?`, `highlightLeadId?`, `ownerView?`, `title?`, `className?`. States: open (card + border) · booked (muted) · offered (ink ring) · yours (amber, the only accent) · closed (muted/40). Week table on md+, day tabs on mobile; no click-to-book. |
| `status-badge.tsx` | `CallStatusBadge` (idle/connecting/live/ended) + eval badge; Phosphor icon + label (color-blind safe). |
| `budget-meter.tsx` | Spend meter — `pill` (nav) and full variants; total/day spend vs cap + health state. |
| `cost-breakdown.tsx` | STT/LLM/TTS/platform cost bars — **neutral `bg-foreground/*` ramp** (NOT the latency scale). |
| `quality-metrics.tsx` | Talk ratio / interruptions / dead-air / WPM. |
| `trace-waterfall.tsx` | Hierarchical span waterfall; uses the frozen latency color scale for timing. |
| `call-timeline.tsx` | Call-event timeline (connecting → live → ended). |
| `star-rating.tsx` | 1–5 star "rate this voice" widget → `voiceRatings.rate`. |
| `provider-chip.tsx` | STT/TTS/LLM provider badge. |
| `eval-results.tsx` | Eval run card (pass/fail, score, transcript). |
| `builder-view-banner.tsx` | "Behind the scenes" framing banner atop technical surfaces. |

## `components/states/` — load / empty / error / guard

| Component | Purpose |
| --- | --- |
| `async-section.tsx` | `matchQuery` triad helper: `undefined`→loading skeleton, `[]`/empty→empty state, data→render. No error arm (Convex `useQuery` throws to a boundary). |
| `empty-state.tsx` | Centered icon + headline + description + one CTA (default Phosphor Tray). |
| `error-state.tsx` | Error display. |
| `guard-panels.tsx` | Budget/concurrency/mic guard panels + dialog (`GuardPanel` base; info/warning/danger tones). Behind `<TechnicalOnly>` where technical. |
| `skeletons.tsx` | Structural loading skeletons. |

## `components/try/` — the guided experience

| Component | Purpose |
| --- | --- |
| `try-experience.tsx` | The **stage machine** (entry-fork → demo/form → recap → your-call → your-recap). Mounted at `/`. |
| `agent-stage.tsx` | In-call agent surface — live `VoiceVisualizer`, calm ended state. |
| `call-controller.tsx` | Call round-button row + countdown ring + post-call CTA (`View report` / `Start another`). |
| `pipeline-selector.tsx` | STT/TTS/LLM mix-and-match picker (behind `<TechnicalOnly>`; defaults to `DEFAULT_PIPELINE`). |
| `reference-panel.tsx` | Shows the active business context (the grounding the receptionist uses). |
| `ingest-form.tsx` | Shared structured-input wrapper under url/text/form inputs. |
| `doc-uploader.tsx` | Drag/drop document upload (PDF/DOCX, OCR for images). |
| `url-input.tsx` · `text-paste.tsx` | BYOD via a website URL / pasted text (Enter / Cmd-Enter submit). |

### `components/try/stages/`

| Stage | Purpose |
| --- | --- |
| `entry-fork.tsx` | "Hear a quick demo" vs "Build my receptionist". |
| `call-stage.tsx` | Live call surface (visualizer + controller + "Show details" toggle). |
| `guided-form.tsx` | The smart form — name + type + services(≤5); "Draft my receptionist" + idle suggestions; fires `receptionist_created`. |
| `other-ways.tsx` | Disclosure reusing paste/upload/link ingestion. |
| `recap.tsx` | Post-call summary + `<AppointmentCard>` (derived from `call.status === "ended"`). |

## `components/chat/` — text twin

| Component | Purpose |
| --- | --- |
| `receptionist-chat.tsx` | Floating bubble + non-modal panel (`useChat`); renders text + calculator chip + `<AppointmentCard>`. Per-browser id via `useVisitorKey`; Escape-to-close; `z-50`; safe-area/dvh. Fires `chat_opened`/`chat_message_sent`/`appointment_booked`. |
| `calculator-result.tsx` | Inline chip rendering a `calculator` tool result. |

## `components/owner/` — owner dashboard

| Component | Purpose |
| --- | --- |
| `owner-stat-card.tsx` | A single KPI card (Calls answered / Appointments booked / Messages taken). |
| `recent-activity-list.tsx` | Recent-activity timeline (result + duration + relative time). |

## `components/app/`

| Component | Purpose |
| --- | --- |
| `post-call-report.tsx` | Composed post-call report (booking/summary first; trace/cost/quality behind `<TechnicalOnly>`). |

---

## Conventions

- One component per file; named exports (no default exports for components).
- Props type defined directly above the component.
- `"use client"` only when the component needs state/effects/browser APIs/event listeners.
- Icon-only buttons get an `aria-label`. Square elements use `size-*`.
- Reuse `<AppointmentCard>`, `<EmptyState>`, `<GuardPanel>`, `async-section`'s `matchQuery`, and the `ui/`
  primitives before writing new ones. See [ui-rules.md](ui-rules.md).
