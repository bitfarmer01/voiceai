/** Persistent top-nav items (Admin is intentionally absent — env-gated at /admin). */
export const NAV_ITEMS = [
  { href: "/try", label: "Try It" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/evals", label: "Evals" },
  { href: "/analytics", label: "Analytics" },
  { href: "/calls", label: "Recent Calls" },
] as const;
