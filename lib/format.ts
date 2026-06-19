/**
 * Formatting + the FROZEN latency × cost encoding scale (ui-development-plan.md §2).
 * A latency colour means the same thing everywhere: the Leaderboard rankings, TraceWaterfall,
 * and CostBreakdown all import these helpers so the encoding never drifts.
 */

export type LatencyBucket = "good" | "ok" | "slow" | "bad";

/** p50 time-to-first-word buckets — frozen thresholds. */
export function latencyBucket(ms: number): LatencyBucket {
  if (ms < 500) return "good";
  if (ms < 900) return "ok";
  if (ms < 1500) return "slow";
  return "bad";
}

/** Tailwind text colour class for a latency value (maps to the frozen scale tokens). */
export function latencyTextClass(ms: number): string {
  return {
    good: "text-latency-good",
    ok: "text-latency-ok",
    slow: "text-latency-slow",
    bad: "text-latency-bad",
  }[latencyBucket(ms)];
}

/** Tailwind bg colour class for a latency value. */
export function latencyBgClass(ms: number): string {
  return {
    good: "bg-latency-good",
    ok: "bg-latency-ok",
    slow: "bg-latency-slow",
    bad: "bg-latency-bad",
  }[latencyBucket(ms)];
}

/** CSS var() for charts/SVG that can't use Tailwind classes. */
export function latencyColorVar(ms: number): string {
  return `var(--latency-${latencyBucket(ms)})`;
}

export function formatUsd(usd: number, fractionDigits = 2): string {
  return `$${usd.toFixed(fractionDigits)}`;
}

/**
 * Absolute timestamp for a call's start, e.g. "Jun 18, 2026, 3:45 PM". Locale-stable
 * (fixed `en-US`, no machine-locale drift between SSR and client) — the single owner of
 * formatted call timestamps. Replaces ad-hoc `new Date(ms).toLocaleString()`.
 */
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export function formatDateTime(ms: number): string {
  return DATE_TIME_FMT.format(new Date(ms));
}

/**
 * A count with thousands separators, e.g. 1234 → "1,234". Locale-stable (`en-US`) and
 * tabular-num friendly. The single owner of formatted counts — replaces bare
 * `n.toLocaleString()`.
 */
const COUNT_FMT = new Intl.NumberFormat("en-US");
export function formatCount(n: number): string {
  return COUNT_FMT.format(n);
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Plain-language relative time — "just now" / "5 min ago" / "3 hr ago" /
 * "yesterday" / "7 days ago". Pure: `now` is passed in (no internal Date.now())
 * so render stays deterministic. Drive it from `useTimeAgo` for hydration safety.
 */
export function timeAgo(from: number, now: number): string {
  const m = Math.floor((now - from) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Countdown like "7h 12m" for per-visitor cap resets. */
export function formatCountdown(msRemaining: number): string {
  const totalMin = Math.max(0, Math.floor(msRemaining / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
