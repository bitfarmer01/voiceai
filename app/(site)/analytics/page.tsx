"use client";

import { useQuery } from "convex/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Clock, DollarSign, Phone, TrendingUp } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatUsd, formatMs } from "@/lib/format";
import { BudgetMeter } from "@/components/shared/budget-meter";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgetState, useRecentCalls } from "@/lib/data";
import type { CallSummary } from "@/lib/types";

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function callsPerDay(calls: CallSummary[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of calls) {
    const day = new Date(c.startedAt).toISOString().slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day: day.slice(5), count })); // "MM-DD"
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const calls = useRecentCalls();
  const budget = useBudgetState();
  const active = useQuery(api.calls.activeCount);
  const today = useQuery(api.calls.countToday);

  const ended = calls.filter((c) => c.status === "ended");
  const successRate =
    ended.length > 0
      ? Math.round((ended.filter((c) => c.outcome === "booked").length / ended.length) * 100)
      : 0;
  const p50Ttfw = Math.round(median(ended.map((c) => c.ttfwMs)));
  const avgCost = ended.length > 0 ? ended.reduce((s, c) => s + c.costUsd, 0) / ended.length : 0;
  const timeSeries = callsPerDay(calls);

  const loading = active === undefined || today === undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregated from the last {calls.length} calls
        </p>
      </div>

      {/* KPI tiles */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              icon={Phone}
              label="Active now"
              value={String(active)}
              sub={`${today} today`}
            />
            <KpiCard
              icon={Clock}
              label="p50 TTFW"
              value={formatMs(p50Ttfw)}
              sub="time to first word"
            />
            <KpiCard
              icon={DollarSign}
              label="Avg cost"
              value={formatUsd(avgCost, 3)}
              sub="per call"
            />
            <KpiCard
              icon={TrendingUp}
              label="Booking rate"
              value={`${successRate}%`}
              sub={`${ended.length} calls sampled`}
            />
          </>
        )}
      </div>

      {/* Time series */}
      {timeSeries.length > 1 && (
        <section className="mb-8 rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">Calls over time</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Calls"
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.12}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Budget section */}
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold flex items-center gap-2">
          <Activity className="size-4" />
          Budget status
        </h2>
        <BudgetMeter budget={budget} />
      </section>
    </div>
  );
}
