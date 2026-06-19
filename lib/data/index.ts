"use client";

/**
 * The data seam. Screens import these hooks — never the fixtures directly.
 * Reads are live: every number flows through a Convex reactive query — no fabricated
 * fallbacks. The two list hooks (useRecentCalls, useProviderStats) return `undefined`
 * while the query is still loading and `[]` when there genuinely is no data, so screens
 * can show an honest skeleton or empty state instead of a fake number. useProviders
 * returns the static CATALOG of selectable voices/options (config, not a measured metric).
 */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  BudgetState,
  CallSummary,
  Provider,
  ProviderKind,
  ProviderStat,
} from "@/lib/types";
import { PROVIDER_CATALOG } from "@/lib/data/providers-catalog";

const FALLBACK_BUDGET: BudgetState = {
  totalSpentUsd: 0,
  totalCapUsd: 40,
  daySpentUsd: 0,
  dayCapUsd: 8,
  activeCalls: 0,
  maxConcurrent: 3,
};

export function useBudgetState(): BudgetState {
  return useQuery(api.budget.getPublicState) ?? FALLBACK_BUDGET;
}

/** `undefined` while loading · `[]` when there are genuinely no calls yet. */
export function useRecentCalls(): CallSummary[] | undefined {
  return useQuery(api.calls.listRecent, { limit: 24 }) as
    | CallSummary[]
    | undefined;
}

/** `undefined` while loading · `[]` when no provider stats exist yet. */
export function useProviderStats(
  kind?: ProviderKind,
): ProviderStat[] | undefined {
  return useQuery(api.providerStats.list, kind ? { kind } : {}) as
    | ProviderStat[]
    | undefined;
}

export function useProviders(kind?: ProviderKind): Provider[] {
  return kind ? PROVIDER_CATALOG.filter((p) => p.kind === kind) : PROVIDER_CATALOG;
}
