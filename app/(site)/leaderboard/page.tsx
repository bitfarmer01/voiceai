"use client";

import * as React from "react";
import { ArrowsDownUp, Lightning, CurrencyDollar, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatMs, formatUsd, latencyColorVar } from "@/lib/format";
import { useProviderStats } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ProviderChip } from "@/components/shared/provider-chip";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { EmptyState } from "@/components/states/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProviderStat, ProviderKind } from "@/lib/types";

type SortKey = "p50LatencyMs" | "costPerMin" | "avgRating" | "callCount";

const KIND_LABEL: Record<ProviderKind, string> = { stt: "Speech-to-text", tts: "Text-to-speech", llm: "Language model" };

/**
 * MetricBar — a thin in-row comparison bar. Length = value / column-max, so bars
 * are only comparable WITHIN one provider kind (the tab boundary). Latency tone
 * follows the app-wide FROZEN latency scale; cost stays neutral ink (no good/bad
 * threshold exists for price). Decorative — the mono number carries the precision.
 */
function MetricBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "latency" | "neutral";
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-full", tone === "neutral" && "bg-foreground/30")}
        style={{
          width: `${pct}%`,
          ...(tone === "latency" ? { backgroundColor: latencyColorVar(value) } : {}),
        }}
      />
    </div>
  );
}

/**
 * LeaderCallouts — the three cross-metric winners for a kind. This is what the
 * old quadrant scatter tried to surface but couldn't: fastest, cheapest, and
 * top-rated are usually three different providers, and no single table sort shows
 * them at once. Amber icon = the single view accent.
 */
function LeaderCallouts({ stats }: { stats: ProviderStat[] }) {
  if (stats.length === 0) return null;
  const fastest = stats.reduce((a, b) => (b.p50LatencyMs < a.p50LatencyMs ? b : a));
  const cheapest = stats.reduce((a, b) => (b.costPerMin < a.costPerMin ? b : a));
  const topRated = stats.reduce((a, b) => (b.avgRating > a.avgRating ? b : a));

  const items = [
    { Icon: Lightning, label: "Fastest", stat: fastest, value: formatMs(fastest.p50LatencyMs) },
    { Icon: CurrencyDollar, label: "Cheapest", stat: cheapest, value: `${formatUsd(cheapest.costPerMin, 3)}/min` },
    { Icon: Star, label: "Top rated", stat: topRated, value: `★ ${topRated.avgRating.toFixed(1)}` },
  ];

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {items.map(({ Icon, label, stat, value }) => (
        <div key={label} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon weight="fill" className="size-3.5 text-primary" aria-hidden />
            {label}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground" title={stat.provider}>
              {stat.provider}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">{value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingTable({ stats, kind }: { stats: ProviderStat[]; kind: ProviderKind }) {
  const [sort, setSort] = React.useState<SortKey>("p50LatencyMs");
  const [dir, setDir] = React.useState<"asc" | "desc">("asc");
  const filtered = stats.filter((s) => s.kind === kind);

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No data yet"
        description="Call data appears here after your first call."
        action={{ label: "Make a call", href: "/try" }}
      />
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    const v = a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : 0;
    return dir === "asc" ? v : -v;
  });
  const maxLatency = Math.max(...filtered.map((s) => s.p50LatencyMs));
  const maxCost = Math.max(...filtered.map((s) => s.costPerMin));

  const toggle = (key: SortKey) => {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      // latency/cost read best low→high; rating/calls read best high→low.
      setDir(key === "avgRating" || key === "callCount" ? "desc" : "asc");
    }
  };

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <TableHead className={cn("p-0", className)}>
      <Button
        variant="ghost"
        className="h-full w-full justify-start gap-1 rounded-none px-3 py-2.5 font-medium"
        onClick={() => toggle(k)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <ArrowsDownUp
          weight="bold"
          className={cn("size-3", sort === k ? "text-primary" : "text-muted-foreground/40")}
          aria-hidden
        />
      </Button>
    </TableHead>
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-4 text-muted-foreground">#</TableHead>
            <TableHead>Provider</TableHead>
            <Th k="p50LatencyMs" label="p50 time-to-first-word" className="min-w-[9rem]" />
            <Th k="costPerMin" label="Cost / min" className="min-w-[8rem]" />
            <Th k="avgRating" label="Rating" />
            <Th k="callCount" label="Calls" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s, i) => (
            <TableRow key={s.provider}>
              <TableCell className="pl-4 font-mono text-xs tabular-nums text-muted-foreground">
                {i + 1}
              </TableCell>
              <TableCell>
                <ProviderChip name={s.provider} source={s.source} />
              </TableCell>
              <TableCell className="min-w-[9rem]">
                <span className="font-mono text-sm tabular-nums">{formatMs(s.p50LatencyMs)}</span>
                <MetricBar value={s.p50LatencyMs} max={maxLatency} tone="latency" />
              </TableCell>
              <TableCell className="min-w-[8rem]">
                <span className="font-mono text-sm tabular-nums">{formatUsd(s.costPerMin, 3)}</span>
                <MetricBar value={s.costPerMin} max={maxCost} tone="neutral" />
              </TableCell>
              <TableCell className="font-mono text-sm tabular-nums">★ {s.avgRating.toFixed(1)}</TableCell>
              <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                {s.callCount.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CategoryPanel({ stats, kind }: { stats: ProviderStat[]; kind: ProviderKind }) {
  const filtered = stats.filter((s) => s.kind === kind);
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold">{KIND_LABEL[kind]} providers</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Ranked by time-to-first-word. Bars compare providers within this category — lower latency and cost win.
      </p>
      <LeaderCallouts stats={filtered} />
      <RankingTable stats={stats} kind={kind} />
    </section>
  );
}

export default function LeaderboardPage() {
  const stats = useProviderStats();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Provider Leaderboard</h1>
          <DemoDataBadge />
        </div>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Compare speed, cost, and quality for every provider in the voice pipeline.
        </p>
      </div>

      <Tabs defaultValue="stt" className="gap-4">
        <TabsList>
          <TabsTrigger value="stt">STT</TabsTrigger>
          <TabsTrigger value="tts">TTS</TabsTrigger>
          <TabsTrigger value="llm">LLM</TabsTrigger>
        </TabsList>
        <TabsContent value="stt">
          <CategoryPanel stats={stats} kind="stt" />
        </TabsContent>
        <TabsContent value="tts">
          <CategoryPanel stats={stats} kind="tts" />
        </TabsContent>
        <TabsContent value="llm">
          <CategoryPanel stats={stats} kind="llm" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
