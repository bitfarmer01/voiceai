# Demo Reference Panel — Design Spec

**Date:** 2026-06-20
**Branch:** fix/try-screen-layout-overflow

## Context

When users start the demo call on `/try`, they have no way to know what the receptionist knows. They freeze on "How can I help you?" because they don't know what to ask, and after they do ask, they can't verify whether the bot's answer came from real source text or was hallucinated.

This spec adds a persistent right-column reference panel to the demo call screen showing:
1. What services the business offers (with pricing)
2. When the business is open (weekly schedule)
3. Which knowledge source chunk the bot drew from to answer each question (live highlight)

The goal is transparency: users should be able to glance right during a call and see exactly what the bot has access to — and see it light up when used.

---

## Layout

### Container widening

`app/(site)/try/page.tsx` — the page container is currently `max-w-[1100px]`. The call stages (`demo-call`, `your-call`) currently render `<CallStage>` inside that container at `max-w-2xl`. When the stage is one of these two, remove the inner `max-w-2xl` constraint and let `CallStage` fill the container.

### Two-column grid in CallStage

`components/try/stages/call-stage.tsx` — restructure the inner wrapper to:

```tsx
<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
  {/* Left: existing call card */}
  <div className="flex flex-col gap-4">
    {/* AgentStage, CallController, AppointmentCard, CallTimeline, Show details */}
  </div>
  {/* Right: reference panel */}
  <ReferencePanel ... />
</div>
```

On screens below `lg` (< 1024px), CSS grid collapses to single column — reference panel stacks below the call card. No JS needed for responsive behavior.

### What the reference panel shows for each call variant

| Section | demo-call | your-call |
|---|---|---|
| Services + pricing | Always shown | Always shown |
| Weekly schedule | Always shown | Always shown |
| Knowledge source | Always shown | Always shown |

The panel appears on both variants. For user-uploaded businesses, pricing falls back to chips (no price column).

---

## New component: `ReferencePanel`

**File:** `components/try/reference-panel.tsx`

```tsx
export function ReferencePanel({
  services,       // ServiceDetail[] | string[]
  hoursText,      // string — raw hours from business.profile.hours
  chunks,         // KnowledgeChunk[] — all chunks for this business
  usedChunkIds,   // string[] — IDs of chunks used this call so far
}: ReferencePanelProps)
```

### Section 1 — Services

When `services` is `ServiceDetail[]` (has pricing structure): render a two-column list — service name on the left, price right-aligned in `font-mono tabular-nums`. Services without a price show a muted "ask for quote" in `text-muted-foreground`.

When `services` is `string[]` (BYOD fallback): render as chips (existing `bg-muted rounded-full` style matching the reassurance chips in `call-stage.tsx`).

**Type** — defined in `lib/types.ts` (shared between the preset and the component):
```ts
export type ServiceDetail = { name: string; price?: string }
```

### Section 2 — Weekly schedule

Import `parseHours`, `describeDay`, `toHHMM` from `convex/lib/hours.ts` (pure V8-safe utilities — no Convex runtime imports, safe to use in client components).

Render a 7-column grid: `['M','T','W','T','F','S','S']`. For each day:
- Open: amber `bg-amber-50 border-amber-200` cell showing open/close times (e.g. "8am / 5pm")
- Closed: muted `bg-muted` cell showing "—"

If `parseHours` returns `null` (unparseable hours string): show the raw `hoursText` as a single line instead of the grid. Never show a broken grid.

### Section 3 — Knowledge source

Fetch all chunks for the business via `useQuery(api.knowledgeChunks.listForBusiness, { businessId })`.

Display each chunk as a small card:
- Header: chunk tag (e.g. "Hours", "Services", "Insurance") in `text-xs text-muted-foreground`
- Body: truncated source text (first ~120 chars), `font-style: italic`

**Highlight state:** when `usedChunkIds.includes(chunk._id.toString())` — Convex `Id` types stringify consistently, so comparing the stringified form against the stored `chunkId` strings is safe:
- `border-2 border-amber-500 bg-amber-50` ring
- Header text turns amber
- No animation (AGENTS.md: no animation unless requested)

**Non-highlighted chunks:** `opacity-60` so used chunks stand out.

**Empty state:** if `chunks` is undefined (loading) show a structural skeleton (3 muted placeholder bars). If `chunks` is `[]`, show "No knowledge chunks loaded" in `text-muted-foreground`.

---

## Data wiring

### Business data in `useTryCall`

`lib/vapi/use-try-call.ts` — add:

```ts
const business = useQuery(
  api.businesses.getById,
  businessId ? { id: businessId } : "skip"
)
const chunks = useQuery(
  api.knowledgeChunks.listForBusiness,
  businessId ? { businessId } : "skip"
)
```

Expose `business` and `chunks` from the hook return value. Pass them down through `CallStage` → `ReferencePanel`.

### Used chunk IDs

The call record already has `structuredData` subscribed via `useQuery(api.calls.getById)` for the booking card. `usedChunks` rides the same subscription — extract `call.structuredData?.usedChunks ?? []` and pass the IDs to `ReferencePanel`.

---

## Backend changes

### 1. `convex/schema.ts`

Add `usedChunks` to `calls.structuredData`:

```ts
usedChunks: v.optional(v.array(v.object({
  chunkId: v.string(),  // stringified Id<"knowledgeChunks">
  text: v.string(),
  tag: v.optional(v.string()),
}))),
```

Using `v.string()` for `chunkId` (not `v.id("knowledgeChunks")`) avoids a validator-schema circular dep in the structuredData object; the string round-trips cleanly.

### 2. `convex/calls.ts`

**New internal mutation `patchUsedChunks`:**

```ts
export const patchUsedChunks = internalMutation({
  args: {
    callId: v.id("calls"),
    chunks: v.array(v.object({
      chunkId: v.string(),
      text: v.string(),
      tag: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { callId, chunks }) => {
    const call = await ctx.db.get(callId)
    if (!call) return
    const existing = call.structuredData?.usedChunks ?? []
    const existingIds = new Set(existing.map(c => c.chunkId))
    const fresh = chunks.filter(c => !existingIds.has(c.chunkId))
    if (fresh.length === 0) return
    await ctx.db.patch(callId, {
      structuredData: {
        ...call.structuredData,
        usedChunks: [...existing, ...fresh],
      },
    })
  },
})
```

**Update `getById` projection** — include `structuredData.usedChunks` in the non-PII projection (`callReportValidator`) so the client receives it.

### 3. `convex/tools.ts` — `lookup_knowledge`

After the existing chunk search, append before returning:

```ts
if (ctx.runMutation && args.callId) {
  await ctx.runMutation(internal.calls.patchUsedChunks, {
    callId: args.callId,
    chunks: results.map(c => ({
      chunkId: c._id.toString(),
      text: c.text,
      tag: c.tags?.[0],
    })),
  })
}
```

Note: `lookup_knowledge` is currently an `internalQuery`. It needs to become an `internalAction` (or the patch call extracted to a separate step in the HTTP handler) because queries cannot run mutations. The HTTP endpoint in `convex/http.ts` that dispatches tool calls is the right place to call `patchUsedChunks` after receiving the lookup result — this avoids the query→mutation upgrade.

**Preferred approach:** in `convex/http.ts`, after the `lookup_knowledge` result is computed, call `ctx.runMutation(internal.calls.patchUsedChunks, ...)` before returning the JSON response.

### 4. New query: `convex/knowledgeChunks.ts`

```ts
export const listForBusiness = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    return ctx.db
      .query("knowledgeChunks")
      .withIndex("by_business", q => q.eq("businessId", businessId))
      .collect()
  },
  returns: v.array(v.object({
    _id: v.id("knowledgeChunks"),
    text: v.string(),
    tags: v.optional(v.array(v.string())),
  })),
})
```

(If a `knowledgeChunks` query file already exists, add this function there.)

---

## Preset extension

`lib/data/presets.ts` — add `serviceDetails` to each preset where pricing is known:

```ts
// Glow Dental
serviceDetails: [
  { name: "Routine cleaning", price: "$120" },
  { name: "Whitening",        price: "$299" },
  { name: "Fillings" },
  { name: "Crowns" },
  { name: "Emergency visits" },
],
```

`ServiceDetail` is imported from `lib/types.ts` (defined above). The preset `services: string[]` field is kept as-is for backwards compatibility — the reference panel uses `serviceDetails` when present, `services` otherwise.

---

## VAPI assistant update

`lib/vapi/assistant.ts` — add one sentence to the system prompt in `assembleAssistant`:

> "Before answering any factual question about the business — hours, services, policies, pricing, or location — always call lookup_knowledge first to retrieve the relevant source text."

This ensures `lookup_knowledge` is called consistently so the source panel lights up during real conversations. Without this instruction, the LLM sometimes answers from its system-prompt context directly and the panel stays dark.

---

## What does NOT change

- The `call-stage.tsx` call card internals (AgentStage, CallController, AppointmentCard, CallTimeline, "Show details") are untouched — they move into the left column as-is.
- `use-vapi-call.ts` is untouched.
- The booking flow (`book_appointment`, `AppointmentCard`) is untouched.
- Mobile layout: single column, reference panel below call card — handled purely by CSS grid collapse, no JS.

---

## Verification

1. `pnpm typecheck` — 0 errors.
2. `pnpm test` — all existing tests pass; add tests for `patchUsedChunks` (idempotent dedup) and `listForBusiness`.
3. Start `pnpm dev` + `convex dev`. Navigate to `/try` → "Hear a quick demo" → start the Glow Dental call.
4. **Services section:** confirm service list shows names + prices; "Fillings" shows "ask for quote".
5. **Hours section:** confirm 7-column grid renders Mon–Fri 8am–5pm, Sat 9am–1pm, Sun closed.
6. **Source highlight:** ask "What are your hours?" — after the bot answers, confirm the matching knowledge chunk card gains the amber border ring.
7. **BYOD:** go through the "Build my receptionist" flow → confirm services render as chips (no price column) on the user's own call.
8. **Responsive:** at viewport < 1024px, confirm the reference panel stacks below the call card.
9. No new lint errors on changed files.
