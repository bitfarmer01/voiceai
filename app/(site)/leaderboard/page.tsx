"use client";

import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMs, formatUsd } from "@/lib/format";
import { useProviderStats } from "@/lib/data";
import { LatencyCostChart } from "@/components/shared/latency-cost-chart";
import { ProviderChip } from "@/components/shared/provider-chip";
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

function SortableTable({
  stats,
  kind,
}: {
  stats: ProviderStat[];
  kind: ProviderKind;
}) {
  const [sort, setSort] = React.useState<SortKey>("p50LatencyMs");
  const [dir, setDir] = React.useState<"asc" | "desc">("asc");
  const filtered = stats.filter((s) => s.kind === kind);
  const sorted = [...filtered].sort((a, b) => {
    const v = a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : 0;
    return dir === "asc" ? v : -v;
  });

  const toggle = (key: SortKey) => {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(key); setDir("asc"); }
  };

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => toggle(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={cn(
            "size-3",
            sort === k ? "text-foreground" : "text-muted-foreground/40",
          )}
        />
      </span>
    </TableHead>
  );

  if (sorted.length === 0) {
    return <EmptyState title="No data yet" description="Call data appears here after your first call." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <Th k="p50LatencyMs" label="p50 TTFW" />
            <Th k="costPerMin" label="$/min" />
            <Th k="avgRating" label="Rating" />
            <Th k="callCount" label="Calls" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s) => (
            <TableRow key={s.provider}>
              <TableCell>
                <ProviderChip name={s.provider} source={s.source} />
              </TableCell>
              <TableCell className="font-mono tabular-nums">{formatMs(s.p50LatencyMs)}</TableCell>
              <TableCell className="font-mono tabular-nums">{formatUsd(s.costPerMin, 3)}</TableCell>
              <TableCell className="font-mono tabular-nums">★ {s.avgRating.toFixed(1)}</TableCell>
              <TableCell className="font-mono tabular-nums">{s.callCount.toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function LeaderboardPage() {
  const stats = useProviderStats();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Provider Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Latency × cost × quality — measured from real calls
        </p>
      </div>

      {/* Quadrant chart */}
      <section className="mb-8 rounded-xl border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold">Latency × Cost quadrant</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Bubble size = avg rating · dashed ring = custom adapter · reference lines at medians
        </p>
        <LatencyCostChart stats={stats} height={380} />
      </section>

      {/* Tables */}
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Rankings</h2>
        <Tabs defaultValue="stt">
          <TabsList className="mb-4">
            <TabsTrigger value="stt">STT</TabsTrigger>
            <TabsTrigger value="tts">TTS</TabsTrigger>
            <TabsTrigger value="llm">LLM</TabsTrigger>
          </TabsList>
          <TabsContent value="stt">
            <SortableTable stats={stats} kind="stt" />
          </TabsContent>
          <TabsContent value="tts">
            <SortableTable stats={stats} kind="tts" />
          </TabsContent>
          <TabsContent value="llm">
            <SortableTable stats={stats} kind="llm" />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
