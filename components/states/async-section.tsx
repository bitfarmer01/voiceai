import type { ReactNode } from "react";

/**
 * matchQuery — the shared loading → empty → data control-flow for a Convex
 * `useQuery` result. It owns ONLY that triad; each route keeps its own bespoke
 * skeleton (loading) and EmptyState (empty) content and renders the populated body.
 *
 * Why a plain function, not a component: it must run at the call site so the route's
 * hooks all run unconditionally, and so it never trips react-hooks/static-components.
 *
 * No error arm by design: Convex `useQuery` throws to the nearest error boundary on
 * failure — it never returns an error value — so there is nothing to branch on here.
 *
 * Branches:
 *   - `query === undefined` (still loading) → `loading`
 *   - loaded but empty                      → `empty`
 *   - loaded with data                      → `data(value)` (value narrowed non-undefined)
 *
 * Emptiness defaults to "an empty array". Pass `isEmpty` for any other shape
 * (e.g. a summary object whose `callsHandled === 0`).
 */
export function matchQuery<T>(
  query: T | undefined,
  branches: {
    loading: ReactNode;
    empty: ReactNode;
    data: (value: T) => ReactNode;
  },
  opts?: { isEmpty?: (value: T) => boolean },
): ReactNode {
  if (query === undefined) return branches.loading;
  const isEmpty = opts?.isEmpty ?? defaultIsEmpty;
  if (isEmpty(query)) return branches.empty;
  return branches.data(query);
}

function defaultIsEmpty(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}
