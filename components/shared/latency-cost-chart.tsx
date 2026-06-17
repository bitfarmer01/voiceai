"use client";

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatMs, formatUsd, latencyColorVar } from "@/lib/format";
import type { ProviderKind, ProviderStat } from "@/lib/types";

/** Distinct marker shapes per provider kind: STT ●, TTS ▲, LLM ◆. */
function Marker(kind: ProviderKind) {
  return function Shape(props: { cx?: number; cy?: number; payload?: Point }) {
    const { cx = 0, cy = 0, payload } = props;
    if (!payload) return <g />;
    const fill = latencyColorVar(payload.x);
    const r = 5 + (payload.z / 5) * 7; // rating → size
    const ring = payload.source === "custom";
    return (
      <g>
        {ring && (
          <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="3 2" />
        )}
        {kind === "stt" && <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.8} />}
        {kind === "tts" && (
          <polygon points={`${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`} fill={fill} fillOpacity={0.8} />
        )}
        {kind === "llm" && (
          <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={fill} fillOpacity={0.8} />
        )}
      </g>
    );
  };
}

interface Point {
  x: number;
  y: number;
  z: number;
  provider: string;
  kind: ProviderKind;
  source: string;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * LatencyCostChart — latency × cost quadrant scatter (x = p50 TTFW, y = cost/min,
 * bubble size = rating). Colour follows the FROZEN latency scale; custom (Fal.ai)
 * adapters get a dashed accent ring. Shared by Leaderboard + Analytics.
 */
export function LatencyCostChart({ stats, height = 420 }: { stats: ProviderStat[]; height?: number }) {
  const points: Point[] = stats.map((s) => ({
    x: s.p50LatencyMs,
    y: s.costPerMin,
    z: s.avgRating,
    provider: s.provider,
    kind: s.kind,
    source: s.source,
  }));
  const mx = median(points.map((p) => p.x));
  const my = median(points.map((p) => p.y));
  const kinds: ProviderKind[] = ["stt", "tts", "llm"];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name="p50 TTFW"
          unit="ms"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          stroke="var(--border)"
          label={{ value: "p50 time-to-first-word (ms)", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="cost/min"
          tickFormatter={(v) => formatUsd(v, 3)}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          stroke="var(--border)"
        />
        <ZAxis type="number" dataKey="z" range={[60, 400]} />
        <ReferenceLine x={mx} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
        <ReferenceLine y={my} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Point;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{p.provider}</p>
                <p className="font-mono tabular-nums text-muted-foreground">
                  {formatMs(p.x)} · {formatUsd(p.y, 3)}/min · ★ {p.z.toFixed(1)}
                </p>
              </div>
            );
          }}
        />
        {kinds.map((k) => (
          <Scatter key={k} data={points.filter((p) => p.kind === k)} shape={Marker(k)} isAnimationActive={false} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
