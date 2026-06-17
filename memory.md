# Memory — Phase 2 Wave 1 Reviewed + Fixed

Last updated: 2026-06-17

## What was built

**This session — code review + fixes (branch: `phase2-grounding-and-rebrand`):**

Wave 1 was reviewed with `/code-review`. 8 findings confirmed and fixed — **all changes are uncommitted working-tree changes**:

- **`convex/leads.ts`**: `getById` now fetches `call.structuredData.booking.slot` in parallel with the business lookup and returns `slot?: string`. Parallelized the two DB reads with `Promise.all`.
- **`app/api/ics/[leadId]/route.ts`**: 4 fixes —
  1. Added `sanitizeIcsLine()` — strips `\r\n` from CONTACT to prevent ICS property injection
  2. Added `escapeIcsText()` — full RFC 5545 §3.3.11 escaping (`\`, `,`, `;`, `\n`) applied to DESCRIPTION
  3. DTSTART now uses `lead.slot` (the actual booked slot from `call.structuredData`) when available; falls back to `createdAt + 1h`
  4. Added trailing `\r\n` after `END:VCALENDAR` (RFC 5545 requires CRLF after last line)
- **`lib/vapi/assistant.ts`**: 2 fixes —
  1. `buildAssistantFromConvexBusiness` knowledge string now guards `biz.chunks.length > 0` before appending "FAQ and policies:" header — prevents dangling section when chunks array is empty
  2. `buildAssistant` emits `console.warn` when `toolBaseUrl` is set but `businessId` is absent — silent tool omission is now loud
- **`app/(site)/evals/page.tsx`**: 2 fixes —
  1. `KpiTile` value element: `text-balance` → `tabular-nums` (AGENTS.md typography rule)
  2. Removed unused `passCount` variable (dead code)

## Decisions made

- **Slot source:** The booked slot lives in `call.structuredData.booking.slot` (set by `bookAppointment` mutation in `convex/tools.ts`). It is NOT stored as a field on the `leads` table. `getById` fetches it via the lead's `callId` FK.
- **Slot parsing in ICS:** `lead.slot` format is `"YYYY-MM-DD HH:mm"` (no timezone). The ICS route treats it as UTC by appending `T` and `Z`: `slot.replace(" ", "T") + ":00Z"`. If slot already has a `T`, it's used as-is.
- **`convex/_generated/api.d.ts` patch:** Still manually patched (staged, not committed). Needs `ingest` module entry added when P2 creates `convex/ingest.ts`.

## Problems solved

- **ICS injection via CONTACT:** `lead.contact` is a raw `v.string()` with no newline restrictions in schema. Fixed by stripping `\r\n` before embedding.
- **ICS wrong appointment time:** `lead.createdAt + 1h` was a placeholder — real slot stored on call's `structuredData`, not on the lead itself.
- **Dangling FAQ header:** `buildAssistantFromConvexBusiness` spread empty chunks, leaving `"FAQ and policies:"` with no body. Fixed with length guard.

## Current state

- **Branch:** `phase2-grounding-and-rebrand`
- **HEAD commit:** `e04c662` (R2 rebrand — last committed change)
- **Uncommitted working-tree changes:** All 8 review fixes across 4 files above
- **Typecheck:** passing (`pnpm typecheck` clean after fixes)
- **Wave 1 tasks:** R1 ✓, R2 ✓, P1 ✓, P4 ✓ — committed; review fixes applied but not yet committed
- **Wave 2:** P2 (ingest pipeline) NOT started — blocked on `pnpm add ai @ai-sdk/openai pdf-parse mammoth zod && pnpm add -D @types/pdf-parse` user approval. P3 (upload UI) blocked on P2.
- **`convex/_generated/api.d.ts`:** staged patch (adds `leads` + `seedPresets`); needs `ingest` entry before committing

## Next session starts with

1. Commit the review fixes: `git add app/api/ics convex/leads.ts lib/vapi/assistant.ts app/\(site\)/evals`
2. Ask user to approve: `pnpm add ai @ai-sdk/openai pdf-parse mammoth zod && pnpm add -D @types/pdf-parse` (Task P2 — ingest pipeline)
3. After P2: dispatch P3 (Upload UI + Try It wiring for Convex businesses)
4. When P2 adds `convex/ingest.ts`: update `convex/_generated/api.d.ts` with `ingest` module entry, then commit the full `api.d.ts` patch

## Open questions

- **Phase 1 PR:** Has the user opened it at `https://github.com/bitfarmer01/voiceai/pull/new/phase1-core-call-loop`?
- **NVIDIA_NIM_API_KEY env var name:** Plan uses `NVIDIA_NIM_API_KEY` — confirm this matches what's set in `.env.local`
- **P2 pnpm install:** Still pending user approval
- **Phase 3 plan:** Not yet written (OTel spans, live trace, post-call report enhancements)
- **Commercial vs portfolio:** Not finalized (affects hosting)
- **VAPI account + provider API keys:** Not provisioned — needed for live call testing
