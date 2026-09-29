# Project Overview

## About the Project

**"The receptionist that never misses a call"** is a full-stack AI **voice receptionist** demo. A
small-business owner builds a receptionist in their browser in under a minute — name, business type, and a few
services — and the app drafts the hours, policies, and FAQ, then puts the owner on a **live phone-quality call**
with their own receptionist. The receptionist answers questions grounded in the business's own information,
checks real availability against the posted hours, books appointments, and takes messages.

The same receptionist is also available as a **floating text-chat widget** (a "text twin") on a per-business
demo page, so a visitor can either call or type.

Everything a call produced — transcript, the structured booking, cost, latency, and a full trace — is recorded
and shown back. The product has **two audiences in one UI**: a non-technical owner sees plain-language results
by default; a **"Behind the scenes"** toggle reveals the engineering showcase (provider leaderboard, call
traces, cost breakdown, quality metrics, evals).

---

## The Problem It Solves

Small businesses miss calls — after hours, during the rush, when everyone is busy — and a missed call is a lost
customer. Hiring a receptionist or wiring up a traditional phone tree is expensive and slow.

This app lets an owner stand up a believable, grounded AI receptionist with no signup, no phone number, and no
configuration files — just their own business details — and immediately hear it work. It answers only from the
owner's information (never invents hours or prices), respects the real schedule when booking, and captures
bookings and messages so nothing is lost.

---

## Pages

```
/                  → Homepage — the guided "try it" experience (demo call → build-your-own)
/home              → Marketing landing page
/try               → Redirects to / (kept for old bookmarks / deployed links)
/app/[slug]        → A configured business's public demo: live call + floating text-chat widget
/setup/[slug]      → Owner-facing setup/configuration for a slug-based demo
/calls             → Recent calls feed (anonymized, real data only)
/calls/[id]        → Post-call report (owner-gated by visitorKey)
/overview          → Owner dashboard — calls answered / appointments booked / messages taken
/leaderboard       → Provider comparison: STT / TTS / LLM by speed, cost, rating  (technical)
/evals             → Regression/quality eval results  (technical; honest empty state today)
/analytics         → PostHog product telemetry  (technical)
/admin             → Admin/audit view, env-gated by NEXT_PUBLIC_ADMIN_ENABLED  (technical)
```

---

## Navigation

Top navbar, no sidebar. Two nav sets driven by the **view-mode toggle** (`lib/view-mode.tsx`, `lib/nav.ts`):

```
Owner (default):     Try it      Calls      Overview
Behind the scenes:   Leaderboard Evals      Analytics
```

A wrench-icon toggle in the header flips between **owner** and **technical** mode (persisted to
`localStorage` key `receptionist:view-mode`, default `owner`). `/admin` is intentionally absent from the nav.

---

## Core User Flows

Every conversation — voice or chat — drives toward a confirmed appointment via the same closed-question script
(`lib/intake-script.ts`): the receptionist opens with a closed "which service?" question, asks that service's fixed
question set (never open-ended), then offers exactly two open slots and books. A live `<AvailabilityCalendar>` sits
beside every call and chat panel, and on both `/try` recaps and `/setup/[slug]`, so the caller and the owner watch
the same slot get claimed in real time.

### The guided `/try` journey (the homepage `/`)

`components/try/try-experience.tsx` is a thin **stage machine**. The finished-call recap is **derived during
render** from `call.status === "ended"` (not set-state-in-effect), so "call again" just works.

```
entry-fork → ┬─ demo-call (Glow Dental preset) → demo-recap → ┐
             └─ guided-form (build my receptionist) ──────────┴→ your-call → your-recap
```

- **Entry fork** — "Hear a quick demo" or "Build my receptionist".
- **Demo call** — a live call against the **Glow Dental** preset (`lib/data/presets.ts`).
- **Guided form** (the centerpiece) — the owner supplies only **name + business type + services (≤5)**; an LLM
  drafts hours/policies/availability/FAQ; the owner reviews/edits (service chips, hours, how-you-book) before
  anything is stored. Two assists: a **"Draft my receptionist"** button and **idle live suggestions**.
- **Your call** — a live call against the just-built receptionist.
- **Recap** — transcript, the structured booking (rendered via `<AppointmentCard>`), cost, latency; a link to
  the full `/calls/[id]` report.
- **"Other ways →"** disclosure reuses paste / upload / link ingestion to build a business from existing
  material (no review step).

### The floating text-chat twin (`/app/[slug]`)

A non-modal chat panel mounted in `app/(site)/app/[slug]/app-demo-client.tsx`. It runs the same grounded
receptionist over the Vercel AI SDK (`useChat`) against an NVIDIA NIM model with four tools (calculator,
lookup_knowledge, check_availability, book_appointment). A chat booking is anchored to a minimal
**`channel:"chat"`** `calls` row so it is auditable but excluded from voice stats. Per-browser session id via
`useVisitorKey` (not `useId`, which collides across visitors). Escape-to-close, safe-area aware.

### Owner dashboards

- **`/overview`** — KPIs from `api.ownerStats.summary`: **Calls answered / Appointments booked / Messages
  taken** + a recent-activity list. Honest empty state at zero; real data only.
- **`/calls`** — the recent-calls feed, grouped by real outcome ("Booked an appointment" / "Took a message" /
  "Answered a question"). Header is honest "Recent calls" (it is the shared anonymized feed).
- **`/calls/[id]`** — the post-call report: booking + summary first; the trace waterfall, cost breakdown, and
  quality metrics are wrapped in `<TechnicalOnly>` under a "Behind the scenes" heading.

### Behind the scenes (technical toggle)

`/leaderboard` (compare providers by speed/cost/rating), `/evals` (quality regressions; honest empty state until
an eval query exists), `/analytics` (PostHog), `/admin` (audit).

---

## Target User

**Default audience: a non-technical small-business owner** (clinic, salon, dental, trades) who wants their
calls answered and appointments booked without hiring a receptionist. They speak plain language, not "STT" or
"latency."

**Secondary audience: an engineering / AI-curious visitor** who wants to see how it is built — provider
leaderboard, real OTel-style traces, cost honesty, evals — surfaced only behind the "Behind the scenes" toggle.

---

## Features In Scope

- Guided in-browser onboarding (name + type + services → LLM-drafted profile → owner review).
- Live voice calls via VAPI (WebRTC), grounded strictly in the owner's business information.
- Bring-your-own-data ingestion: paste text, upload a document (PDF/DOCX, OCR for images), or a URL.
- Real schedule parsing — free-text hours parsed to a weekly schedule; bookings validated against it.
- Sample booking calendar — every business's next 14 days on a 30-minute grid, ~40% pre-booked; `check_availability`
  and `book_appointment` read and claim against it, and it's visible live beside the call, the chat, both recaps,
  and `/setup`.
- Per-service closed-choice intake — a fixed, LLM-drafted (or generic-fallback) question set per service that the
  receptionist asks before offering slots, so it never asks an open-ended question.
- Receptionist tools: `lookup_knowledge` (grounding), `check_availability`, `book_appointment` (idempotent).
- Inline reactive appointment card (Convex subscription, not the fragile VAPI tool-result stream).
- A text-chat twin of the voice receptionist (Vercel AI SDK + NVIDIA NIM) with a calculator tool.
- Owner-first dashboards (overview KPIs, recent calls, post-call report) with a technical toggle.
- Engineering showcase: provider leaderboard, trace waterfall, cost breakdown, quality metrics, evals.
- A demo budget guard (concurrency + daily/total spend caps + a hard per-call time cap).
- PostHog product analytics (autocapture + named events, anonymous by default).
- Deployed on Netlify (live at `voiceai-receptionist.netlify.app`).

## Features Out of Scope

- User accounts / login / multi-tenant SaaS — sessions are anonymous, identified by a per-browser `visitorKey`.
- A real phone number / PSTN inbound — calls are in-browser WebRTC demos.
- Email/SMS follow-up, calendar sync (Google/Calendly), payments.
- PostHog session replay (deliberately disabled).
- Per-visitor daily call cap — `VISITOR_CALL_CAP` exists in the contract but is **not enforced**; a running
  call is bounded by `MAX_CALL_SECONDS` instead.
- Continuous Netlify deploy (manual CLI today) and a production Convex deployment (runs on the dev backend).
- A `convex/evals.ts` query — `/evals` shows an honest empty state until one exists.

---

## PostHog Events

Named events (all no-op when `NEXT_PUBLIC_POSTHOG_KEY` is unset):

```typescript
call_started;          // lib/vapi/use-try-call.ts (voice)
call_ended;            // lib/vapi/use-try-call.ts (voice)
appointment_booked;    // use-try-call.ts (voice) AND components/chat/receptionist-chat.tsx (chat)
chat_opened;           // components/chat/receptionist-chat.tsx
chat_message_sent;     // components/chat/receptionist-chat.tsx
receptionist_created;  // components/try/stages/guided-form.tsx (both the /try and setup save paths)
```

Plus autocapture (clicks, pageviews via `capture_pageview: 'history_change'`, pageleave) from the
`defaults: "2026-01-30"` snapshot. See [library-docs.md](library-docs.md) for the init and the
headless-browser bot-filter gotcha.

---

## Success Criteria

- An owner can go from the homepage to a live call with their own receptionist in under a minute, no signup.
- The receptionist answers only from the supplied business info and audibly refuses to invent facts.
- `check_availability` reflects the real posted hours; `book_appointment` rejects past/closed/out-of-hours slots.
- A booking made mid-call renders an appointment card live (Convex reactivity) and a downloadable `.ics`.
- The text-chat twin gives the same grounded answers and can book.
- Owner dashboards show only real data; zero-state is honest, never fabricated.
- The cost meter and budget guard keep the public demo within its spend caps.
- `pnpm typecheck` is clean and the test suite is green (see [code-standards.md](code-standards.md)).

---

## Build Status

The app is **built and deployed**; the remaining work is live human verification and optional infra upgrades.
This section replaces a separate progress tracker.

### Completed
- **Design system (Signal Bold)** — Space Grotesk / Hanken Grotesk / IBM Plex Mono; warm paper + ink + one amber
  accent; Phosphor icons; tuned dark mode. See [ui-tokens.md](ui-tokens.md).
- **Landing + appointment UI** — live `VoiceVisualizer`, reusable `<AppointmentCard>` with real `.ics`.
- **End-call hardening** — optimistic `stop()`, single final flush, working End button + verbal hang-up
  (`endCall` tool + `endCallPhrases`). Live-verified.
- **BYOD + guided `/try`** — document/paste/URL ingestion; the guided stage machine and smart form.
- **Receptionist behavior fix** — free-text hours parsed (`convex/lib/hours.ts`), real availability + booking
  validation, hardened system prompt (grounding, date anchor, check-before-book), temperature 0.2.
- **Owner-first repositioning** — view-mode toggle, owner nav, `/overview`, real-data-only (mock data removed).
- **APoSD design audit** — split-brain call finalization fix, typed `getById` projection, shared helpers.
- **Text-twin chat** (PR #9) — Vercel AI SDK + NVIDIA NIM, four tools, `channel:"chat"` booking anchor.
- **PostHog analytics** — `instrumentation-client.ts` init + named events; verified events flow.
- **Netlify deploy** — `netlify.toml` (Node 22), pointed at the dev Convex backend; live.

### Pending (needs a human / infra)
- **Live voice-call smoke test** on the deployed `/try` (real mic; confirm grounding, hours adherence,
  mid-call appointment card, verbal hang-up). Logic + prompt are test-verified; model behavior on a real
  WebRTC call is not automatable.
- **`NVIDIA_NIM_API_KEY` in the Next.js env** (`.env.local` / Netlify site env) so the text-chat widget can
  call the model; confirm the NIM model does tool-calling (`CHAT_MODEL` is swappable).
- **`NEXT_PUBLIC_POSTHOG_KEY` in the Netlify site env** (inlined at build time; local is set).
- **Optional infra**: continuous Netlify deploy (`netlify init`), and a production Convex deployment (currently
  on the seeded dev backend `notable-wildcat-778`).
