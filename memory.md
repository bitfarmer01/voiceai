# Memory — Phase 2 Complete (All Tasks Done)

Last updated: 2026-06-17

## What was built

**This session — P2 + P3 (branch: `phase2-grounding-and-rebrand`):**

**P2 — Ingest Pipeline (commit `63d9e4f`):**
- `convex/businesses.ts`: added `generateUploadUrl` mutation, `getWithChunks` query, `insertUploadedBusiness` internalMutation
- `convex/ingest.ts`: Node action — parses PDF (pdf-parse v2 `PDFParse` class API), DOCX (mammoth), or TXT; calls `nvidia/nemotron-3-nano-30b-a3b` via Vercel AI SDK `generateObject`; sanitizes for prompt injection; persists via `insertUploadedBusiness`
- `convex/ingest.test.ts`: 3 tests (insert+chunks, expiresAt, null getWithChunks) — all pass
- `convex/_generated/api.d.ts`: patched with `ingest` module entry
- `.env.example`: documented `NVIDIA_NIM_API_KEY`

**P3 — Upload UI + Try It Wiring (commit `45ebf49`):**
- `components/try/doc-uploader.tsx`: drag-and-drop / click zone, 5 states (idle/uploading/analyzing/ready/error)
- `app/(site)/try/page.tsx`: Presets / Upload doc mode toggle; `handleIngest` callback; branched `beginCall` for upload mode using `buildAssistantFromConvexBusiness`

**Review fixes (commit `8357370`):**
- ICS injection safety, real slot from `call.structuredData`, FAQ guard, businessId warning, tabular-nums fix

## Decisions made

- **pdf-parse v2 API:** v2 is a class, not a function. Import `{ PDFParse }`, construct with `new PDFParse({ data: buffer })`, call `parser.getText({ first: 20 })`. The v1 `pdfParse(buffer, { max: 20 })` pattern does NOT work.
- **convex-test fake IDs:** Must match `<digits><tableName>` format (e.g. `"1_storage"`, `"1businesses"`). Old random strings like `"kg2x9abc123"` fail validator checks.
- **`convex/_generated/api.d.ts`** must be manually patched when new Convex modules are added until `convex dev` runs.
- **Upload mode `beginCall`:** Uses `uploadedBizQ._id` (from `useQuery(api.businesses.getWithChunks)`) as `businessId`, and `buildAssistantFromConvexBusiness` instead of `buildAssistant`.

## Problems solved

- **pdf-parse v2 has no `.default` export** — fixed by using named `{ PDFParse }` import with class constructor pattern.
- **convex-test rejects non-table-prefixed IDs** — `tableNameFromId` requires `<digits><tableName>` format.

## Current state

- **Branch:** `phase2-grounding-and-rebrand`
- **HEAD commit:** `45ebf49` (P3 upload UI)
- **Typecheck:** passing
- **All Phase 2 tasks:** R1 ✓, R2 ✓, P1 ✓, P2 ✓, P3 ✓, P4 ✓ — all committed
- **Not yet done:** code review of P2 + P3, Phase 2 PR not opened

## Next session starts with

1. Run `/code-review` on Wave 2 changes: `git diff 8357370..45ebf49`
2. Open Phase 2 PR (or ask user if they want to merge directly)
3. Discuss Phase 3 scope (OTel spans, live trace, post-call report enhancements)
4. Ask user: has Phase 1 PR been opened? (`https://github.com/bitfarmer01/voiceai/pull/new/phase1-core-call-loop`)

## Open questions

- **Phase 1 PR:** Has the user opened it?
- **NVIDIA_NIM_API_KEY:** What key name is in `.env.local`? Plan uses `NVIDIA_NIM_API_KEY` — confirm match.
- **Live call testing:** VAPI account + provider API keys not yet provisioned.
- **Phase 3 plan:** Not yet written.
- **Commercial vs portfolio:** Not finalized (affects hosting).
