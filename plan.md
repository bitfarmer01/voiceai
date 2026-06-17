# VAPI Voice Receptionist Showcase — Design Spec

**Date:** 2026-06-16
**Status:** Approved design, pre-implementation
**Type:** Standalone portfolio/credibility project (new repo)

---

## 1. One-liner

A web-only, fully-anonymous **document-grounded AI receptionist** demo: a visitor uploads or picks a business document, then talks — live in the browser — to a receptionist grounded in that document. It answers FAQs from the doc, proposes and "books" appointments against the doc's hours/calendar, and captures caller intent. Built to showcase production-grade voice-AI engineering: deep observability, hot-swappable STT/TTS providers with a live benchmarking leaderboard, an eval harness, guardrails, and a hard $40 budget guard.

The "multiple VAPI features" are demonstrated **through one coherent product**, not as disconnected demos.

---

## 2. Audience, goals, success criteria

**Audience:** technical peers, prospective clients/employers — people who will judge engineering depth. Shared on X/LinkedIn/portfolio. The win: *"this person ships serious, production-grade voice AI."*

**Success criteria (a build is "done & impressive" when):**
- A stranger, with **no signup**, can pick/upload a business, talk to a grounded receptionist, and receive a booking + post-call report in **under 2 minutes**.
- **Observability adds zero latency** to the conversation: the live view renders from client SDK events; all spans/logs are written async, off the audio critical path.
- **Spend can never exceed $40** — verified by forcing the guard.
- STT/TTS swapping works across **≥6 native providers + 1 Fal.ai custom adapter**; the leaderboard reflects real call data.
- The **eval suite runs and flags regressions** when a prompt/model/provider changes.
- Light/dark parity, responsive, and every list/detail view has loading/empty/error states.

---

## 3. Non-goals (explicit)

- Phone channels (no inbound number, no outbound "call me").
- Real calendar write (Google Calendar, etc.) — bookings are simulated + captured.
- Accounts/auth — fully anonymous.
- Multi-orchestrator support (e.g. Retell) — VAPI is the sole orchestrator.
- Vector/semantic RAG — keyword lookup over extracted chunks is sufficient.
- Persistent cross-session user history.

---

## 4. Locked decisions

| Area | Decision |
|---|---|
| Project home | New standalone repo (own shareable URL), not inside the Linear clone |
| Product | Document-grounded AI receptionist (FAQs + scheduling + intake) |
| Structure | One cohesive receptionist; breadth shown via the live control room + features |
| Channel | Web-only (WebRTC via the Vapi Web SDK) |
| Access | Fully anonymous; IP + browser-fingerprint rate limiting; hard spend guard as backstop |
| Budget posture | Conservative: **$40** hard global stop, **$8/day** sub-cap, **2 calls/visitor/day**, **3** concurrent, **120s** per-call cap |
| Scheduling | Simulated + captured (structured booking + downloadable `.ics` / optional email); no external calendar |
| Provider swap | Native VAPI STT/TTS providers (config) + one real **Fal.ai** custom-adapter (VAPI custom-STT/TTS contract) |
| Telemetry sink | **Convex-native, OpenTelemetry-modeled** spans/traces/logs |
| Production scope | "Everything" — full production-grade feature set, delivered in phases |
| Hero screen | **Mission control** — 3 columns: doc+pipeline / agent stage+transcript / live trace |
| Post-call report | **Two-column dashboard** — summary+booking+.ics+rating / trace waterfall+cost+replay |
| Leaderboard | **Quadrant + tables** — latency×cost scatter (bubble=quality) over sortable STT/TTS tables |

---

## 5. Architecture

**Three planes:**
- **Next.js 16 (App Router)** — UI shell, all screens, async params/searchParams.
- **Convex** — all backend state and logic: ingestion results, sessions, rate-limit + budget state, call logs, OTel telemetry, the VAPI webhook handler, the receptionist's tool endpoints, the Fal.ai custom-adapter endpoints, the async telemetry scheduler, and the purge cron.
- **VAPI** — the realtime voice call over WebRTC via `@vapi-ai/web`, orchestrating STT → LLM → TTS.

### 5.1 Document → grounding (key technical decision)

Raw files are never handed to VAPI. On upload/select:
1. **Ingest pass** (Convex Node action + a cheap LLM via the Vercel AI SDK): extract a compact, structured **Business Profile** — `companyName`, `hours`, `services`, `policies`, `availability/calendar` — plus an **FAQ/knowledge chunk set**. Persisted in Convex keyed to an ephemeral `sessionId` with an `expiresAt`.
2. **At call start:** inject the Business Profile into the assistant system prompt via VAPI **`assistantOverrides`** (dynamic per session — no per-visitor assistant creation), and expose a small tool set the receptionist can call:
   - `lookup_knowledge` — FAQ/policy retrieval from Convex (keyword search index over chunks).
   - `check_availability` — reads the doc's hours/calendar.
   - `book_appointment` — captures a structured booking.

This makes breadth **visible inside one call**: grounding (profile + `lookup_knowledge`), tool calling (`check_availability`/`book_appointment`), structured capture, and multilingual all fire naturally.

> Rejected alternative: VAPI native per-file Knowledge Base. It's heavier for arbitrary anonymous uploads (per-visitor KB creation/cleanup, slower, costs storage). The extract-then-inject approach is dynamic, cheaper, faster, and self-cleaning.

### 5.2 Call lifecycle

1. Browser calls `canStartCall()` (Convex) → passes the guard → starts the call with the Vapi Web SDK (transient assistant + `assistantOverrides`).
2. **Live:** SDK event callbacks (transcript, speech-start/end, tool-calls, messages) render the control room from **local React state** — zero network on the render path.
3. **Server:** VAPI posts events (status-update, tool-calls, **end-of-call report with cost + per-component latency**) to a **Convex webhook** (`httpAction`). The webhook **verifies the signature, acks `200` immediately**, and does heavy processing in a scheduled action.
4. On end-of-call: Convex records the call, decrements concurrency, increments visitor usage, and adds the call's **actual cost** to `budgetState`.
5. **Hard length cap:** `maxDurationSeconds=120` on the call (server) + a 2-min client timer.

### 5.3 Telemetry off the critical path (design principle)

The latency-critical loop (STT→LLM→TTS) runs on **VAPI's** infrastructure — we mostly *consume* telemetry VAPI already produces; we do not instrument the audio hot path.

- **Live view = lightweight, best-effort:** rendered from Vapi Web SDK client events in local state. Writes to Convex are **batched + debounced (~500ms or on call end), fire-and-forget** — never a synchronous round-trip mid-utterance.
- **Post-call view = full-fidelity, authoritative:** reconstructed from VAPI's end-of-call report (true per-component latencies + cost).
- **The only critical-path code we own** — the three tool endpoints and the Fal.ai adapter — follows **"respond first, log after"**: the handler returns its result, then emits its span via `ctx.scheduler.runAfter(0, …)` / fire-and-forget. Tool logic stays on indexed Convex queries (fast by construction).
- **Webhook is inherently off-path** (VAPI calls us): ack fast, process async.

**OTel-shaped model (stored in Convex):** a span = `{ traceId(call), spanId, parentId, kind: stt|llm|tts|tool|guardrail|turn, startMs, endMs, durationMs, attrs }`; logs are structured and correlated by `traceId`. Real spans/traces/logs semantics, none of it in the way of the audio.

### 5.4 Budget guard

`canStartCall()` runs before every call and blocks if **any** of: global spend ≥ `$40`, today ≥ `$8`, this visitor ≥ `2` calls today, or live concurrency ≥ `3`. `budgetState` is authoritative (summed from VAPI's reported per-call cost). Each limit has a graceful UI state ("demo busy" / "limit reached" / "budget reached today"). **Provider choice can never break the cap** — accounting is on actual reported cost; the 120s cap bounds worst-case per call.

---

## 6. VAPI integration specifics

- **Web SDK:** `@vapi-ai/web` — `vapi.start({ ...transient assistant, assistantOverrides })`; listeners for `transcript`, `message`, `tool-calls`, speech-start/end, and call-end.
- **Per-call `assistantOverrides`:** system prompt (Business Profile injected **as data**, with injection guardrail), `transcriber` (chosen STT), `voice` (chosen TTS + voice), `model`, `tools` (the three above), `maxDurationSeconds=120`, `analysisPlan` (summary + structured-data schema + success evaluation), `server.url` (webhook), recording per privacy setting.
- **Custom tools:** VAPI custom tool → Convex `httpAction` endpoint (`server.url`).
- **Custom STT/TTS adapter (Fal.ai):** implement VAPI's **custom-transcriber** (websocket) and **custom-voice** (HTTP) contracts as Convex/Next endpoints proxying Fal.ai-hosted models.
- **In-call LLM:** managed by VAPI (configurable model; default a cheap/fast model such as `gpt-4o-mini` for cost). Ingestion, eval scoring, and post-call analysis use the Vercel AI SDK directly in Convex actions.

---

## 7. Provider swapping

- **Provider registry** in Convex: each STT/TTS entry carries `{ vapiProviderKey | customAdapter, costPerMin, languages, sampleClip }`. STT and TTS chosen **independently** (mix-and-match).
- **Native (config only):** Cartesia, Amazon (Polly/Transcribe), Microsoft (Azure Speech), Deepgram, AssemblyAI, ElevenLabs, OpenAI, PlayHT, etc.
- **Custom adapter:** Fal.ai via the VAPI custom contract — proves "not limited to the built-in list."
- **UX:** a "Voice Pipeline" selector on the hero screen (left column). Swapping is **per call** (`assistantOverrides`); VAPI can't change STT/TTS mid-call, so changing the pipeline restarts the call — made explicit in the UI.

---

## 8. Production-grade feature set ("everything")

1. **Observability & call tracing** — per-turn trace (STT/LLM/tool/TTS latencies, time-to-first-word), cost breakdown by component, tool-call inspector, **session replay** (audio synced to transcript + events), aggregate dashboard.
2. **Provider benchmarking leaderboard** (★) — latency + cost + rated quality per provider from real calls; quadrant + sortable tables; `providerStats` rollup.
3. **Eval-driven development** (★) — scripted simulated-caller scenarios scored on task success, grounding accuracy, latency; pass/fail + regression view across config changes.
4. **Guardrails & safety** — prompt-injection defense (doc content sandboxed as data), anti-hallucination ("I don't have that, let me take a message"), stay-in-role/out-of-scope refusal, abuse handling, a "guardrail fired" indicator.
5. **Privacy & compliance** — recording/consent disclosure, PII redaction in stored transcripts/logs, ephemeral data with 24h auto-purge, webhook signature verification.
6. **Reliability / graceful degradation** — provider circuit-breaker/fallback, tool-timeout fallbacks, no-input retry → escalate, idempotent booking, concurrency queue ("you're 2nd in line").
7. **Closing the loop** — human-escalation/lead capture (callback request as structured lead, optional email), outbound webhook/Slack on booking, quality metrics (talk-ratio, interruptions, dead-air, WPM, sentiment), A/B prompt testing.

---

## 9. Screens & information architecture

**Top nav:** Try It · Leaderboard · Evals · Analytics · Recent Calls · (hidden) Admin.

- **Try It (hero) — Mission control (3 columns):** left = doc picker/upload + STT/TTS pipeline config; center = agent stage (orb/waveform, call controls, status) + live transcript; right = live trace (per-turn latency, tool calls, cost meter vs $40 guard, guardrail events, detected language).
- **Post-call report — Two-column dashboard:** left = summary + structured booking + `.ics` download + "rate this voice" ★; right = trace waterfall + cost breakdown + session replay + quality metrics.
- **Leaderboard — Quadrant + tables:** latency × cost scatter (bubble = quality) above sortable STT and TTS ranking tables.
- **Analytics dashboard:** KPI tiles (calls, latency p50/p95, avg cost, success rate, language mix) + time series + breakdowns; reuses the leaderboard chart language.
- **Recent calls wall:** realtime, anonymized — proves it's live and used.
- **Admin (private):** spend dashboard, call logs, guard status, eval runs. Protected by an **env-gated shared secret** (e.g. a secret path/token or basic auth) — not a user-account system, consistent with the no-auth non-goal.
- **Evals:** scenario list, run trigger, scored results, regression diff.

All UI via shadcn/ui + Tailwind v4 (through the `shadcn` skill), lucide icons, sonner, recharts (shadcn chart). Light/dark, responsive, loading/empty/error states everywhere.

---

## 10. Data model (Convex)

- **`businesses`** — `{ kind: "preset"|"upload", sessionId?, name, profile{companyName,hours,services,policies,availability}, sourceMeta, createdAt, expiresAt }`. Index `by_session`, `by_kind`.
- **`knowledgeChunks`** — `{ businessId, text, tags }` + **search index** for `lookup_knowledge`. Index `by_business`.
- **`calls`** — `{ sessionId, businessId, vapiCallId, status, startedAt, endedAt, durationSec, costUsd, costBreakdown{stt,llm,tts,platform}, sttProvider, ttsProvider, ttsVoice, languages[], successEval, summary, structuredData, qualityMetrics{talkRatio,interruptions,deadAirSec,wpm,sentiment}, guardrailEvents[], visitorKey }`. Index `by_vapiCallId`, `by_session`, `by_status`, `by_startedAt`.
- **`spans`** — `{ traceId, spanId, parentId?, kind, startMs, endMs, durationMs, attrs }`. Index `by_trace`.
- **`logs`** — `{ traceId, ts, level, msg, attrs }`. Index `by_trace`.
- **`transcriptTurns`** — `{ callId, idx, role, text, ts, confidence? }`. Index `by_call`.
- **`voiceRatings`** — `{ callId, ttsProvider, ttsVoice, stars, visitorKey }`. Index `by_provider`.
- **`providerStats`** (rollup, updated async on call-end) — `{ kind:"stt"|"tts", provider, voice?, p50LatencyMs, avgCostPerMin, avgRating, callCount, languages[] }`. Index `by_kind`.
- **`evalCases`** — `{ name, businessId, script[], expectations }`. **`evalRuns`** — `{ caseId, config{stt,tts,llm,businessId}, passed, score, latencyMs, groundingScore, transcript, createdAt }`. Index `by_case`.
- **`budgetState`** (singleton) — `{ totalSpentUsd, daySpentUsd, day, activeCalls }`.
- **`visitorUsage`** — `{ visitorKey, day, callsToday }`. Index `by_visitor_day`.
- **`leads`** — `{ callId, businessId, contact, request, createdAt }` (escalation/callback capture).

Convex conventions: object-form functions with `args`+`returns` validators; an index for every read path (no `.filter()` for WHERE); `internal*` for private functions; external IO only in actions; webhook + adapters as `httpAction`s; purge via cron.

---

## 11. Tech stack

Next.js 16 + React 19 (async params, Turbopack, pnpm) · Convex (data, actions, httpActions, scheduler, cron) · shadcn/ui + Tailwind v4 + recharts · `@vapi-ai/web` · Vercel AI SDK (`@ai-sdk/*`, provider-configurable) for ingestion/eval/analysis · doc parsing (pdf/docx/text) in a Node Convex action · optional Resend for email/.ics. New repo carries its own `AGENTS.md` + plan; UI work routes through the `shadcn` skill.

---

## 12. Phasing roadmap (each phase independently shippable + verifiable)

Cost safety lands in Phase 1 — before anything is public — so overspend is impossible even mid-build.

- **Phase 0 — Foundation.** New repo scaffold (Next 16 + Convex + shadcn), VAPI account/keys, env, base transient assistant, deploy skeleton, `AGENTS.md`/plan. *Verify:* app deploys; Convex + VAPI reachable; a hardcoded test call connects.
- **Phase 1 — Core call loop + cost safety.** Preset business → in-browser call → live transcript → mission-control shell → end; webhook + `calls`; **budget guard, rate limits, concurrency, 120s cap.** *Verify:* a call connects and transcribes; forcing the guard blocks new calls; concurrency/visitor caps enforced; webhook cost lands in `budgetState`.
- **Phase 2 — Grounding + tools.** Upload + ingest → Business Profile; `lookup_knowledge`/`check_availability`/`book_appointment`; structured booking + `.ics`; guardrails + prompt-injection sandbox + anti-hallucination. *Verify:* upload a doc, ask an FAQ (grounded answer), book a slot (structured data + `.ics`); a doc with "ignore your rules" cannot hijack the agent; off-doc question yields "take a message," not a hallucination.
- **Phase 3 — Observability depth.** OTel spans/logs in Convex (async); full live trace; two-column post-call report (waterfall, cost breakdown, replay, quality metrics). *Verify:* trace + cost breakdown render; replay scrubs audio synced to transcript; **measured: telemetry adds no latency** (live view from client events; spans written via scheduler).
- **Phase 4 — Provider swap + leaderboard.** STT/TTS picker (native) + Fal.ai custom adapter; voice ratings; quadrant+tables leaderboard; `providerStats` rollup. *Verify:* swap across ≥6 native providers + Fal.ai; restart-on-swap UX clear; leaderboard reflects real call latency/cost/ratings.
- **Phase 5 — Evals + analytics.** Eval harness (scenarios, scoring, regression); analytics dashboard; recent-calls wall; admin spend view. *Verify:* eval suite runs and scores; changing a model/prompt surfaces a regression; analytics + recent-calls update in realtime.
- **Phase 6 — Loop-closers + polish.** Lead capture/escalation, outbound webhook/Slack, A/B prompt testing, multilingual, dark mode, responsive, all empty/loading/error states. *Verify:* escalation creates a lead + fires the webhook; multilingual call handled; light/dark parity + responsive audit pass.

---

## 13. Privacy & compliance

Recording/consent disclosure before the first call; PII redaction in stored transcripts/logs; uploaded docs + transcripts + (optional) audio auto-purged after 24h via cron; webhook signature verification; secrets via env; no raw-audio retention beyond the ephemeral window.

---

## 14. Risks & open items

- **Fal.ai custom-adapter latency** — the custom STT/TTS path adds round-trips; benchmark early and keep a native fallback (ties into the circuit-breaker). Confirm VAPI's current custom-transcriber/custom-voice contract during Phase 4.
- **Doc ingestion variance** — messy PDFs/DOCX may extract poorly; cap size/pages, validate the extracted profile, and fall back to "couldn't read that — try another file or a preset."
- **Cost-meter accuracy mid-call** — VAPI's authoritative cost arrives in the end-of-call report; the live meter is an estimate. Label it "est." and reconcile on call-end.
- **Anonymous abuse** — IP+fingerprint limits are evadable (VPN-hopping); the **hard spend guard is the real backstop**. Consider adding a lightweight challenge later if abused.
- **Provider API keys** — each native provider may need its own key in VAPI; confirm which are usable on the VAPI credit vs requiring separate accounts.
- **VAPI API drift** — verify Web SDK + assistantOverrides + analysisPlan shapes against current VAPI docs at implementation time (treat training knowledge as stale).
