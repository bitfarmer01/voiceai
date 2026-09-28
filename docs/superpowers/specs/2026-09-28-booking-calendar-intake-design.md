# Booking calendar + service-driven intake — design

**Date:** 2026-09-28 · **Branch:** feat/chatbot-text-twin · **Status:** awaiting review

## Goal

Every receptionist conversation (voice and chat) drives toward **a confirmed appointment**. To make that real:

1. Every business always has a **sample calendar** — the next 14 days with some slots already booked and others open —
   and availability/booking respect it.
2. The receptionist asks a **fixed, closed-choice question set per service** (never open-ended questions), then offers
   exactly two concrete open slots.
3. The calendar is **visible** to the caller (next to the call/chat, updating live) and to the owner.

### What the user said vs. what was assumed

- **Said:** always have a sample calendar with booked + available dates; ask a set of questions based on the services,
  not open-ended; the goal is always setting an appointment.
- **Decided together:** calendar visible to caller + owner; question sets LLM-drafted at setup and stored;
  deterministic ~40% booked sample over 14 days; questions enforced via prompt injection (approach A).
- **Assumed:** no external calendar sync; 30-minute slots, one appointment per slot; "services" = `profile.services`.

### Non-goals

Google/Calendly sync, click-to-book on the calendar, per-service durations, owner editing of individual slots,
full question-set editing (owners can only remove a question), `/overview` changes.

## 1. Data + calendar

### `appointments` table (new, `convex/schema.ts`)

| field | type | notes |
|---|---|---|
| `businessId` | `v.id("businesses")` | |
| `date` | `v.string()` | `YYYY-MM-DD`, business wall-clock (same face-value convention as `parseSlot`) |
| `time` | `v.string()` | `HH:mm`, on the 30-minute grid |
| `source` | `"sample" \| "booked"` | |
| `leadId` | `v.optional(v.id("leads"))` | set for real bookings |
| `service` | `v.optional(v.string())` | |
| `customerFirstName` | `v.optional(v.string())` | first name only — shown on the calendar |

Indexes: `by_business_date` (`businessId`, `date`), `by_business_slot` (`businessId`, `date`, `time`).
Invariant: at most one row per (`businessId`, `date`, `time`), enforced inside the inserting mutation.

The table is new, so it doesn't touch any frozen field. It's mirrored in `convex/_contracts.ts` and `lib/types.ts`.

### Seeding — `convex/lib/calendarSeed.ts` (pure)

`sampleSlots(businessId, schedule | null, fromDate, days = 14): { date, time }[]`

- Walk each open day in `schedule` on a 30-minute grid (reuse `slotsFor` / `isOpenOn` from `convex/lib/hours.ts`).
- Mark a slot booked when `hash(businessId + date + time) % 100 < 40` — stable per business, ~40% density.
- `schedule === null` (unparseable hours) → seed over the same `GENERIC_SLOTS` the degrade path uses, Mon–Fri.
- Pure and clock-free (caller passes `fromDate`), so it's unit-testable.

Callers:

- **On business creation** (preset seed, configured/guided, upload/ingest) → an internal mutation
  `calendar.ensureSeeded({ businessId })` inserts missing `sample` rows for today…today+13.
- **Daily cron** (`convex/crons.ts`, new) → `calendar.rollForward`: for every non-expired business, call the same
  top-up and delete `sample` rows dated before today. Idempotent: it only inserts missing slots, so re-runs are safe.

### `check_availability` (`convex/tools.ts`)

- Load taken slots for the date via `by_business_date` and remove them from the candidate grid.
- Return the **2 soonest open slots** at or after `preferredTime`, or after the earliest time in the requested
  part of the day. Today's past times are excluded.
- If that day has no open slot, scan forward up to 14 days and return the first 2 open slots, with a
  note like "Tuesday is full — next open is Wednesday."
- Degrade path (unparseable hours) also subtracts taken slots.
- Return shape unchanged (`checkAvailabilityResult`). Optional addition: `offeredSlots` is written to the call (see §3).

### `book_appointment` + chat booking (`convex/tools.ts`, `convex/chat.ts`, `convex/lib/bookingSlot.ts`)

- After existing hours validation and **before** persisting, check `by_business_slot`. If the slot is taken, return
  `booked:false` with a message naming the 2 nearest open alternatives. Nothing is persisted.
- On success, insert an `appointments` row (`source:"booked"`, `leadId`, `service`, `customerFirstName`) in the
  **same mutation** as the lead, so Convex's serializable transactions prevent double-booking.
- Idempotency key behaviour unchanged. A retry with the same key returns the original confirmation and does not
  conflict with its own appointment row.
- Date-only slots (no time) are **no longer accepted as bookable**. The model must pick a concrete offered time.
  The tool returns `booked:false` with alternatives.

## 2. Question sets + conversation flow

### Stored shape

`profile.intakeQuestions: v.optional(v.array(v.object({ service: v.string(), questions: v.array(v.object({ id: v.string(), prompt: v.string(), options: v.array(v.string()) })) })))`

This is an optional addition to the frozen `businessProfile`. It's mirrored in `_contracts.ts` and `lib/types.ts`.

Limits, enforced by a validator in `convex/lib/intake.ts`: 2–3 questions per service, 2–4 options per question,
each option ≤ 40 characters, a service must match an entry in `profile.services`, and any extra is trimmed.

### Sources

- **Guided / configured businesses:** the existing LLM drafting step (`convex/lib/nim.ts` / `convex/sources.ts`)
  also returns `intakeQuestions`. Output that fails validation is dropped per service. That service then uses the
  generic set.
- **Glow Dental preset:** hand-authored in `lib/data/presets.ts` / `convex/seedPresets.ts`.
- **Upload / link / paste businesses:** drafted during ingest the same way.
- **Generic fallback** (missing, invalid, or legacy businesses): "Is this your first visit, or have you been in
  before?" → First visit / Returning.
- **Owner review** (`components/try/stages/guided-form.tsx`): each service chip shows its questions. The owner can
  remove a question. Editing questions and options is out of scope.

### Conversation script — shared by `lib/chat/system-prompt.ts` and `lib/vapi/assistant.ts`

A shared helper, `lib/intake-script.ts` → `buildIntakeScript(profile)`, renders the per-service questions and the
steps below as prompt text, so both channels stay identical:

1. **Closed opener.** Voice `firstMessage`: "Thanks for calling {name}! Are you booking {s1}, {s2}, or {s3} today?"
   If there are more than 3 services, name the first 3 and add "or something else?". Chat sends the same first message.
2. **Service questions,** in order, one per turn, reading the options as written. If an answer doesn't map to an
   option, offer the options once more, then move on.
3. **Part of day.** Ask "Morning or afternoon?". Only offer the parts of the day the business is actually open
   (derived from hours in the helper). Call `check_availability`, then offer **exactly two** slots:
   "I have {A} or {B} — which works?"
4. **Name, then phone or email.** Read the booking back for a yes/no, then call `book_appointment`.
   Intake answers go in `notes` as `Question: Answer` lines, so the booking contract doesn't change.
5. **Side questions.** Answer factual questions in one sentence (via `lookup_knowledge`), then return to the next
   unanswered step with a closed prompt ("Want me to get that booked?").
6. **Message-taking is the only exit.** Take a message only when the caller declines booking twice or no open slot
   exists in the next 14 days.
7. **Never ask open-ended questions** ("How can I help?", "What can I do for you?").

## 3. Calendar UI

### `components/shared/availability-calendar.tsx`

Props: `{ businessId, highlightLeadId?, offeredSlots?, ownerView? }`. Data comes from the new reactive query
`api.calendar.window({ businessId, from, days })`, which returns the open grid plus taken slots.

- **Desktop:** a week grid, with days as columns and 30-minute rows between the earliest open and latest close
  time. Previous/next arrows move across the 14 days. **Mobile:** day `Tabs`, each with a slot list.
- **States** (theme tokens only — no hex, gradients, or glow):
  - **Open:** paper background with an ink outline.
  - **Booked (sample):** muted fill, labeled "Booked".
  - **Just booked** (`highlightLeadId`): the single amber accent, labeled with first name and service.
  - **Offered:** a quiet ring.
  - **Closed day:** hatched, labeled "Closed".
- **Owner view** also shows first name and service on booked slots. The caller view shows only "Booked" for other
  people's slots.
- **Motion:** only a ≤150ms opacity fade when a slot changes state, and none under `prefers-reduced-motion`.
- **Accessibility:** cells are non-interactive, each with an `aria-label` ("Tuesday 10:00, booked").
  Numbers use `tabular-nums`. Read-only — no click-to-book.
- **Loading / error:** `components/states/*` skeleton and error. Unparseable hours → an inline note,
  "Showing example times."

### Offered-slot highlight

- **Chat:** read from the latest `checkAvailability` tool result in `useChat` messages.
- **Voice:** `check_availability` writes an optional `offeredSlots: v.optional(v.array(v.string()))` onto the active
  call (an additive field on `calls`). The client reads it through the existing call subscription.

### Placement

- **`/app/[slug]`** (`app-demo-client.tsx`): beside the call controls, clear of the floating chat panel.
- **`/` guided flow** (`try-experience.tsx`): during the demo call and during "your call", and on both recaps, with
  `highlightLeadId` set to the booking.
- **`/setup/[slug]`** (`setup-client.tsx`): an "Your calendar" section with `ownerView`.

## Error handling summary

| Case | Behaviour |
|---|---|
| Slot taken between offer and book | `booked:false` + 2 nearest alternatives; the model re-offers |
| Day full | Availability scans forward, with a note naming the next open day |
| Nothing open for 14 days | Availability returns empty + note; the script falls back to taking a message |
| Unparseable hours | Seeded on generic slots; availability and booking still subtract taken slots; UI note |
| Drafted questions invalid | Dropped for that service; the generic set is used |
| Cron missed a day | Harmless — `ensureSeeded` also runs when a call or chat session starts (a mutation), as an idempotent top-up |

## Testing

- `calendarSeed.test.ts`: the same input gives the same output; density is 40% ± 10% over 14 days; nothing falls
  outside hours or on closed days; the null-schedule fallback works.
- `tools.test.ts`: availability excludes taken slots and returns 2 slots; the full-day forward scan works;
  booking a taken slot is rejected with alternatives; an idempotent retry doesn't self-conflict; a date-only slot
  is rejected.
- `chat.test.ts`: the chat booking path shows the same conflict behaviour.
- `intake.test.ts`: the validator trims and clamps; unknown services are dropped; the fallback kicks in.
- Prompt snapshots for `buildChatSystemPrompt` and the VAPI assistant include the rendered intake script and the
  closed opener.
- `crons`/`rollForward`: deletes past sample rows, tops up to 14 days, and is idempotent.

## Docs to update

`context/architecture.md` (the `appointments` table, the `calendar` module, crons, `intakeQuestions`),
`context/project-overview.md` (flows), and `context/ui-registry.md` (`AvailabilityCalendar`).
