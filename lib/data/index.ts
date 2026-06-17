"use client";

/**
 * The data seam. Screens import these hooks — never the fixtures directly.
 * Reads now flow through live Convex reactive queries where a backend query exists;
 * providers/provider-stats stay on mock until Wave B writes those queries. Same return
 * shapes throughout, so no screen changed when reads went live.
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
import {
  MOCK_PROVIDERS,
  MOCK_PROVIDER_STATS,
  MOCK_RECENT_CALLS,
} from "@/lib/data/mock";

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

export function useActiveCallCount(): number {
  return useQuery(api.calls.activeCount) ?? 0;
}

export function useCallsToday(): number {
  return useQuery(api.calls.countToday) ?? 0;
}

export function useRecentCalls(): CallSummary[] {
  const data = useQuery(api.calls.listRecent, { limit: 24 });
  return (data as CallSummary[] | undefined) ?? MOCK_RECENT_CALLS;
}

// ── still mock until Wave B (no backing query yet) ──────────────────────────────
export function useProviderStats(kind?: ProviderKind): ProviderStat[] {
  return kind ? MOCK_PROVIDER_STATS.filter((p) => p.kind === kind) : MOCK_PROVIDER_STATS;
}

export function useProviders(kind?: ProviderKind): Provider[] {
  return kind ? MOCK_PROVIDERS.filter((p) => p.kind === kind) : MOCK_PROVIDERS;
}
