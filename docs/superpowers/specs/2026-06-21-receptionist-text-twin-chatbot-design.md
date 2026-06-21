# Receptionist Text Twin — Chatbot Widget

**Date:** 2026-06-21
**Status:** Approved for implementation
**Branch:** fix/try-screen-layout-overflow (or a new feature branch)

## Context

The product is a voice AI receptionist demo platform (Next 16 + Convex + VAPI).
Today a visitor on `/app/[slug]` can place a 2-minute **voice** call to a
pre-configured business. This feature adds a **text twin** of that receptionist:
a customizable, out-of-the-box floating chat widget (Vercel AI SDK `useChat`)
grounded in the same business, that can do math with a calculator tool, answer
from the business's knowledge, and book appointments in-chat.

The Vercel AI SDK is **already wired into this repo** — `ai@6.0.207` +
`@ai-sdk/openai@3` are used server-side in Convex actions
(`convex/sources.ts`, `convex/ingest.ts`) pointed at **NVIDIA NIM** via an
OpenAI-compatible `createOpenAI({ baseURL })`. There is no streaming chat UI
(`useChat`) or `app/api/chat` route yet. This feature adds them, reusing the
existing NIM model and the frozen receptionist tool contracts.

## Language

| Term | Definition |
|---|---|
| **Text twin** | The text-chat equivalent of the voice receptionist for a given business. |
| **Configured business** | A business row (`kind: "configured"`/`"preset"`/`"upload"`) with a `profile` + knowledge chunks. Unchanged by this feature. |
| **Tool** | A Vercel AI SDK `tool()` the chat model can call mid-turn: `calculator`, `lookupKnowledge`, `checkAvailability`, `bookAppointment`. |
| **Chat anchor** | A minimal `calls` row (`channel: "chat"`) created only when a chat booking happens, so `leads.callId` (a required FK) is satisfied. Excluded from voice stats/feeds. |
| **Ephemeral chat** | Chat *messages* are never persisted; they live only in client `useChat` state. Only a booking (and its anchor) is written. |

## Decisions (locked)

- **Approach A** — a Next.js streaming route (`app/api/chat/route.ts`, Node
  runtime) runs the AI SDK `streamText` with tools; the tools reach Convex
  through **new thin public wrappers** in `convex/chat.ts` that delegate to the
  existing **frozen** `internal.tools.*`. The frozen contracts in
  `convex/tools.ts` / `convex/_contracts.ts` are **not modified**.
- **Calculator** — a hand-rolled **safe arithmetic evaluator** in
  `lib/chat/calculator.ts` (no new dependency, no `eval`). TDD'd.
- **Booking anchor** — the chat booking wrapper creates a minimal
  `channel: "chat"` `calls` row so the booking persists through the existing
  internal `bookAppointment`. Chat *messages* stay ephemeral.
- **Placement** — a **floating chat bubble** on `/app/[slug]`, grounded in the
  already-loaded business + the optional caller micro-context.
- **Capabilities** — streaming chat, calculator, knowledge grounding (RAG),
  in-chat booking, caller micro-context. **No transcript persistence.**
- **Model** — reuse NIM. New optional `CHAT_MODEL` env (default
  `nvidia/nemotron-3-nano-30b-a3b`) so the tool-calling model is swappable.

## Architecture

```
<ReceptionistChat businessId companyName callerContext accent? greeting? />   ← floating bubble (client)
   │  useChat({ api: '/api/chat' }) with body { businessId, callerContext }
   ▼
app/api/chat/route.ts  (Node runtime)                        ← streamText + tools, NIM model
   │   tools:
   │   ├─ calculator        → lib/chat/calculator.ts (pure, in-process, no network)
   │   ├─ lookupKnowledge   → ConvexHttpClient → api.chat.lookupKnowledge   (public wrapper)
   │   ├─ checkAvailability → ConvexHttpClient → api.chat.checkAvailability (public wrapper)
   │   └─ bookAppointment   → ConvexHttpClient → api.chat.bookAppointment   (public wrapper + anchor)
   ▼
convex/chat.ts  (public query/mutation wrappers)  →  ctx.runQuery/runMutation(internal.tools.*)  ← FROZEN
```

### New / changed files

| File | Type | Purpose |
|---|---|---|
| `app/api/chat/route.ts` | NEW | Streaming chat endpoint. `streamText({ model: nim(CHAT_MODEL), system, messages, tools, stopWhen: stepCountIs(5) })` → `toUIMessageStreamResponse()`. |
| `lib/chat/calculator.ts` | NEW | Pure safe arithmetic evaluator (`+ - * / % ^`, parens, unary minus, decimals). |
| `lib/chat/calculator.test.ts` | NEW | TDD: precedence, parens, unary, divide-by-zero, malformed input. |
| `lib/chat/tools.ts` | NEW | AI SDK `tool()` definitions + zod schemas; `lookupKnowledge`/`checkAvailability`/`bookAppointment` execute via `ConvexHttpClient`. |
| `lib/chat/system-prompt.ts` | NEW | Builds the chat system prompt from a business + `callerContext`, mirroring `lib/vapi/assistant.ts` instructions (grounding, scope, calculator-for-math). |
| `convex/chat.ts` | NEW | Public `lookupKnowledge`/`checkAvailability` (queries) + `bookAppointment` (mutation, creates the chat anchor) — each delegates to `internal.tools.*`. |
| `convex/chat.test.ts` | NEW | Wrappers delegate; `bookAppointment` creates a `channel:"chat"` anchor and books; degrade paths. |
| `components/chat/receptionist-chat.tsx` | NEW | Floating bubble + panel, `useChat`, renders text + tool affordances + `<AppointmentCard>`. |
| `components/chat/calculator-result.tsx` | NEW | Inline chip showing `expression = result` when the calculator runs. |
| `convex/schema.ts` | EDIT | Add optional `channel: v.optional(v.union(v.literal("voice"), v.literal("chat")))` to `calls` (additive, frozen-safe). |
| `app/(site)/app/[slug]/page.tsx` | EDIT | Mount `<ReceptionistChat>` alongside the existing voice stage machine. |
| `package.json` | EDIT | Add `@ai-sdk/react` (for `useChat`). |

### Data model change (`convex/schema.ts`)

```ts
// calls table — one additive optional field:
channel: v.optional(v.union(v.literal("voice"), v.literal("chat"))),
// Absent / "voice" = a real voice call (unchanged behavior).
// "chat" = a minimal anchor created only to attach a chat booking's lead.
```

No new index required (the anchor is looked up via the existing `by_business`
index, same as the internal `bookAppointment` already does).

### Booking anchor shape

When `convex/chat.ts bookAppointment` runs, it find-or-creates a `channel:"chat"`
anchor row for `{ businessId, sessionId }`, then calls
`internal.tools.bookAppointment` (which attaches the lead to the most-recent
call for the business — now the anchor). The anchor fills the required `calls`
fields honestly for a text session: `status:"ended"`, `costUsd:0`,
`durationSec:0`, zeroed `costBreakdown`, provider fields = `"text"`,
`languages:[]`, `startedAt`/`endedAt` = now.

**Honesty guard:** voice-facing reads must exclude `channel:"chat"`. In scope:
- `convex/calls.ts` `listRecentAnonymized` (the `/calls` feed)
- `convex/ownerStats.ts` `summary` (the `/overview` KPIs)

Both already filter on `status`; add a `channel !== "chat"` guard so chat
anchors never inflate voice stats.

### Assistant builder

`lib/vapi/assistant.ts` is **not changed**. The chat system prompt is a parallel
builder (`lib/chat/system-prompt.ts`) that reuses the same instruction content
(business grounding via `lookupKnowledge`, scoped refusal, check-availability-
before-book, the `callerContext` addendum) plus one rule: *use the `calculator`
tool for any arithmetic.* Keeping it separate avoids coupling the VAPI assistant
shape to the chat prompt.

## Tools (AI SDK `tool()` + zod)

| Tool | Args (zod) | Behavior |
|---|---|---|
| `calculator` | `{ expression: string }` | Evaluates safely in-process via `lib/chat/calculator.ts`. Returns `{ result }` or `{ error }`. Model is instructed to use it for **any** arithmetic. |
| `lookupKnowledge` | `{ query: string }` | RAG over the business's chunks → grounds answers. |
| `checkAvailability` | `{ date?: string }` | Real slots from parsed business hours. |
| `bookAppointment` | `{ slot, customerName, contact, service?, notes? }` | Books via the anchor path; result drives `<AppointmentCard>`. |

`businessId` and `callerContext` come from the `useChat` request body, not the
model — the model never chooses which business it is.

## Frontend widget

- **`components/chat/receptionist-chat.tsx`** — floating bubble (icon-only,
  Phosphor `ChatCircle`, `aria-label`) that opens a panel. `useChat` from
  `@ai-sdk/react`, `api: '/api/chat'`, `body: { businessId, callerContext }`.
  Renders streamed assistant text, a subtle "calculating… / checking…"
  affordance for in-flight tool parts, and the existing **`<AppointmentCard>`**
  when a `bookAppointment` tool part returns `booked: true` (via
  `bookingFromStructuredData`).
- **`components/chat/calculator-result.tsx`** — inline chip rendering
  `expression = result` with `tabular-nums` so math is visible.
- Mounted on `app/(site)/app/[slug]/page.tsx`, fed the already-loaded
  `business` (`getBySlug`) + the optional `callerContext` from the pre-call form.

### Design-system compliance (AGENTS.md)

- Icon-only trigger → **`aria-label`**; Phosphor icon; Signal Bold tokens;
  **ink-on-amber** accent (one accent per view).
- Fixed elements respect **`safe-area-inset`**; panel sizing is **`dvh`**-based
  (never `h-screen`); panel sits in the existing **z-index scale** (`z-50`).
- Focus-trapped panel uses **Base UI / Radix** primitives — no hand-rolled
  focus/keyboard behavior.
- No gradients, no glow. Animation limited to compositor props
  (entrance `opacity`/`transform`, ≤200ms, `ease-out`, honors
  `prefers-reduced-motion`). Structural skeleton while the first token streams.
- `text-pretty` body; `tabular-nums` for numeric/calculator output;
  `truncate`/`line-clamp` for dense rows.

## Error handling

- **NIM / stream error** → friendly inline error bubble next to the input (not a
  crash) with a retry affordance.
- **Calculator parse error** → tool returns `{ error }`; the model apologizes /
  asks the user to rephrase.
- **Tool / Convex failure** → degrade-open exactly as the voice tools already do
  (transparent note in the tool result), never a hard crash.
- **Missing business / slug** → the widget simply does not mount (nothing to
  ground the chat).

## Dependencies & environment

- **Add:** `@ai-sdk/react` (`pnpm add @ai-sdk/react`) — provides `useChat`.
  `ai@6` + `@ai-sdk/openai@3` are already installed.
- **Env (Next/Netlify):** `NVIDIA_NIM_API_KEY` must be available to the Next
  runtime (today it is set only in Convex). New optional `CHAT_MODEL`
  (default `nvidia/nemotron-3-nano-30b-a3b`).
- **Risk:** confirm the chosen NIM model supports OpenAI-style **tool calling +
  streaming**. `CHAT_MODEL` makes swapping to a tool-capable NIM model trivial
  if the default underperforms. This is the one item that needs a live check.

## Testing (TDD)

- `lib/chat/calculator.test.ts` — arithmetic, operator precedence, parentheses,
  unary minus, divide-by-zero, malformed input, whitespace.
- `convex/chat.test.ts` — public wrappers delegate to `internal.tools.*`;
  `bookAppointment` find-or-creates the `channel:"chat"` anchor and books;
  degrade-open paths preserved; honesty guard (chat anchors excluded from
  `listRecentAnonymized` / `ownerStats.summary`).
- **Manual smoke on `/app/[slug]`** (needs a human + a running model):
  1. Ask a knowledge question → grounded answer from the business chunks.
  2. Ask a math question → calculator chip shows `expression = result`.
  3. Book a slot → `<AppointmentCard>` renders with a working `.ics`.
  4. Confirm chat messages are NOT in any feed; the booking's anchor is NOT in
     the voice `/calls` feed or `/overview` KPIs.
  5. Light + dark; reduced-motion; keyboard open/close + focus trap.

## Verification checklist

1. `pnpm typecheck` — 0 errors.
2. `pnpm test` — calculator + convex/chat suites green; no pre-existing
   regressions beyond the known `tools.test.ts` date case.
3. `pnpm lint` — no **new** errors over baseline.
4. Floating bubble appears on `/app/[slug]`, opens/closes via keyboard, traps
   focus, respects safe-area + reduced-motion (light + dark).
5. Knowledge question → grounded; math question → calculator chip; booking →
   AppointmentCard + `.ics`.
6. Chat anchors absent from `/calls` and `/overview`.

## Out of scope (YAGNI)

Transcript persistence; auth on the widget; a standalone cross-site `<script>`
embed; voice↔text conversation continuity; analytics/reporting on chat; multi-
business switching within one widget. The widget is reusable by props but is not
yet a third-party embeddable.
