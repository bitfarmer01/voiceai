"use client";

import * as React from "react";
import { parseHours } from "@/convex/lib/hours";
import type { KnowledgeChunk, ServiceDetail } from "@/lib/types";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;
// JS getUTCDay order: 0=Sun, 1=Mon…6=Sat. Display Mon→Sun.
const DAY_INDICES = [1, 2, 3, 4, 5, 6, 0];

function toAMPM(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

function isServiceDetailArray(arr: ServiceDetail[] | string[]): arr is ServiceDetail[] {
  return arr.length === 0 || typeof arr[0] === "object";
}

interface ReferencePanelProps {
  services: ServiceDetail[] | string[];
  hoursText: string;
  chunks: KnowledgeChunk[] | undefined;
  usedChunkIds: string[];
}

export function ReferencePanel({ services, hoursText, chunks, usedChunkIds }: ReferencePanelProps) {
  const schedule = React.useMemo(() => parseHours(hoursText), [hoursText]);
  const usedSet = React.useMemo(() => new Set(usedChunkIds), [usedChunkIds]);
  const hasDetails = isServiceDetailArray(services);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Services ── */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Services
        </h2>
        {hasDetails ? (
          <div className="space-y-2">
            {(services as ServiceDetail[]).map((s) => (
              <div key={s.name} className="flex items-baseline justify-between gap-2">
                <span className="text-sm">{s.name}</span>
                {s.price ? (
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {s.price}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs italic text-muted-foreground">
                    ask for quote
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(services as string[]).map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Hours ── */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hours
        </h2>
        {schedule ? (
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, i) => {
              const dayIndex = DAY_INDICES[i];
              const hours = schedule[dayIndex];
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                  {hours ? (
                    <div className="flex w-full flex-col items-center rounded border border-amber-200 bg-amber-50 px-0.5 py-1 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <span className="text-[9px] tabular-nums leading-tight text-amber-700 dark:text-amber-400">
                        {toAMPM(hours.openMin)}
                      </span>
                      <span className="text-[9px] tabular-nums leading-tight text-amber-700 dark:text-amber-400">
                        {toAMPM(hours.closeMin)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex w-full items-center justify-center rounded border border-border bg-muted px-0.5 py-2">
                      <span className="text-[9px] text-muted-foreground">—</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{hoursText || "Hours not available."}</p>
        )}
      </div>

      {/* ── Knowledge source ── */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Knowledge source
        </h2>
        {chunks === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-muted" />
            ))}
          </div>
        ) : chunks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No knowledge chunks loaded.</p>
        ) : (
          <div className="space-y-2">
            {chunks.map((chunk) => {
              const used = usedSet.has(chunk._id.toString());
              return (
                <div
                  key={chunk._id}
                  className={
                    used
                      ? "rounded-lg border-2 border-amber-500 bg-amber-50 p-2.5 dark:bg-amber-950/20"
                      : "rounded-lg border bg-muted/50 p-2.5 opacity-60"
                  }
                >
                  {chunk.tags[0] && (
                    <p
                      className={`mb-0.5 text-xs font-medium ${used ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {chunk.tags[0]}
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs italic text-foreground/80">
                    {chunk.text.length > 120 ? `${chunk.text.slice(0, 120)}…` : chunk.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
