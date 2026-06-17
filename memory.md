# Memory — VAPI Voice Receptionist: planning + UI design input

Last updated: 2026-06-16

## What was built

This session produced planning + design artifacts (no application code scaffolded yet):

- **Approved implementation plan** at `/Users/rajathraghu/.claude/plans/use-design-guide-md-and-plan-md-glittery-reef.md`
  — free/alternative tool stack, a parallel-build workstream decomposition (WS0–WS8), and a condensed UI plan.
- **`ui-development-plan.md`** (repo root) — the full design-guide.md-fidelity UI development plan; this is the
  **Step-1 input for Google Stitch**. Contains: global conventions, design system (tokens + frozen latency×cost
  color scale + state/guard templates), all 8 screen specs, **9 paste-ready Stitch prompts** (§4, foundation +
  8 screens in build order), and a screen→workstream mapping.
- **Google Stitch MCP server configured** (HTTP, project-local scope) — registered in `/Users/rajathraghu/.claude.json`
  and health-check ✔ Connected. (API key intentionally NOT stored here — see `claude mcp get stitch` for it.)

## Decisions made

- **Product reconciliation:** the project is the **VAPI voice receptionist** (`plan.md`). `design-guide.md`
  ("Braindump") is NOT a second product — it's the *fidelity template* for what a UI dev plan should look like.
- **Build flow:** Claude UI plan → **Google Stitch** (generate screens) → **Lovable/shadcn** (React) → wire to
  **Convex + VAPI**. **Skip** Lovable Cloud / Stripe (app is anonymous: no auth, no payments).
- **Cost posture:** keep **VAPI** as orchestrator; everything else free/free-tier. $40 hard guard caps the only
  real cost.
- **Orchestrator v1 = VAPI only.** Build the internal Engine-adapter *seam* now; defer the 2nd engine
  (LiveKit/Pipecat) to a later wave.
- **Scope = full production build** (all workstreams). **Parallelism =** multiple Claude agents in isolated git
  worktrees, building against frozen day-0 contracts + seeded fake data.
- **Free stack picks:** Deepgram Flux STT + Cartesia Sonic-3 TTS (defaults); AssemblyAI/Gladia + Aura-2/ElevenLabs/
  Azure as leaderboard entries; Kokoro-82M via fal.ai as the OSS custom-voice adapter; Groq in-call LLM with
  gpt-4o-mini paid fallback; Gemini 2.5 Flash-Lite offline; Convex + Langfuse Hobby observability; Promptfoo evals;
  unpdf/mammoth parsing; Convex BM25 + alias keywords (no vector RAG); Vercel Hobby host; pure-client `.ics`.
- **Baked-in defaults (easy to flip):** Vercel Hobby (portfolio/non-commercial), Gemini free **Tier-1** (stops
  data-training on uploads), IP-based rate limiting added to the 2-calls/visitor cap.

## Problems solved

- **`claude mcp add` header ordering:** `-H/--header` is variadic and greedily eats positional args. The header
  flag MUST come **last**: `claude mcp add --transport http stitch <url> --header "X-Goog-Api-Key: ..."`.
- **Reconciled the two contradictory docs** (Braindump journaling app vs voice receptionist) via clarifying
  questions — confirmed design-guide.md is a template, not a product.

## Current state

- Repo is essentially empty app-wise: `plan.md`, `design-guide.md`, `ui-development-plan.md`, `memory.md`, plus
  `.claude/` skills. **Not a git repo yet.** Tooling present: node v24, pnpm 10.26, npm 10, git 2.50; npm registry
  reachable.
- Stitch MCP is **connected but its tools are NOT loaded in the current session** — Claude Code loads MCP tools at
  startup, so a session restart is required before the `stitch` tools are callable.
- No Convex/Next.js/VAPI scaffolding done. No accounts/keys wired (VAPI, provider keys) beyond the Stitch key.

## Next session starts with

Two parallelizable tracks — pick one (or run both):

1. **Design track (Stitch):** restart the session so `stitch` MCP tools load, then drive Stitch through the 9
   prompts in `ui-development-plan.md` §4 **in order** (start with prompt **0. Foundation / Design System**),
   generating light+dark + desktop+mobile each → export → Lovable/shadcn.
2. **Build track (WS0 foundation):** scaffold Next.js 16 + React 19 + Convex + shadcn/Tailwind v4, then write the
   **frozen day-0 contracts**: `convex/schema.ts` (tables per plan.md §10), `convex/_contracts.ts` (OTel span
   shape, 3 tool contracts, engine-adapter seam, custom STT/TTS adapter contracts, UI prop types), `convex/seed.ts`
   (deterministic fixtures), plus the real-VAPI-report normalization spike (record 1 manual call to ground the span
   shape) and WS0.5 CI/contract-conformance harness. WS0 unblocks all other worktree agents.

## Open questions

- 2nd voice engine (LiveKit free-tier vs Pipecat self-host) deferred — revisit after the VAPI path proves the
  contracts end-to-end.
- VAPI account + per-provider API keys not yet provisioned (needed for live calls / WS2 / WS4).
- Commercial vs pure-portfolio not finalized — affects Vercel Hobby vs Cloudflare Pages and the Gemini tier choice.
