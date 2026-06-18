/** A single top-nav entry. */
export interface NavItem {
  href: string;
  label: string;
}

/**
 * Always-visible, owner-facing navigation — plain language, no jargon.
 * (Admin is intentionally absent — env-gated at /admin.)
 */
export const OWNER_NAV: readonly NavItem[] = [
  { href: "/try", label: "Try it" },
  { href: "/calls", label: "Calls" },
  { href: "/overview", label: "Overview" },
] as const;

/**
 * "Behind the scenes" navigation — only shown when the view-mode toggle is on.
 * These are the technical screens (comparisons, quality checks, deeper charts).
 */
export const TECHNICAL_NAV: readonly NavItem[] = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/evals", label: "Evals" },
  { href: "/analytics", label: "Analytics" },
] as const;
