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

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "2m ago", "3h ago", "just now" — for tickers, recent-calls, freshness chips. */
export function timeAgo(from: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - from) / 1000));
  if (sec < 45) return "just now";
  if (sec < 90) return "1m ago";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 7200) return "1h ago";
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Countdown like "7h 12m" for per-visitor cap resets. */
export function formatCountdown(msRemaining: number): string {
  const totalMin = Math.max(0, Math.floor(msRemaining / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
