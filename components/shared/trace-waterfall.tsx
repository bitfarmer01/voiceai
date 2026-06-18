import { cn } from "@/lib/utils";
import { formatMs, latencyTextClass } from "@/lib/format";
import type { SpanKind } from "@/lib/types";

/** Component-span colours for the waterfall (kept consistent with the Stitch report peek). */
const SPAN_CLS: Partial<Record<SpanKind, string>> = {
  stt: "bg-latency-good",
  llm: "bg-latency-slow",
  tool: "bg-info",
  tts: "bg-primary",
  guardrail: "bg-danger",
};

const SPAN_LABEL: Partial<Record<SpanKind, string>> = {
  stt: "STT",
  llm: "LLM",
  tool: "Tool",
  tts: "TTS",
  guardrail: "Guard",
};

export interface WaterfallSpan {
  kind: SpanKind;
  label?: string;
  startMs: number;
  durationMs: number;
}

export interface WaterfallTurn {
  idx: number;
  spans: WaterfallSpan[];
  ttfwMs: number;
  totalMs: number;
}

/**
 * TraceWaterfall — per-turn STT→LLM→tool→TTS spans on a shared time axis, with a
 * dashed time-to-first-word marker. Authoritative on the report; live (best-effort)
 * on Try It. Appears on Landing teaser, Try It, Report, Admin.
 */
export function TraceWaterfall({ turns, className }: { turns: WaterfallTurn[]; className?: string }) {
  const axisMax = Math.max(1, ...turns.map((t) => t.totalMs));

  return (
    <div className={cn("space-y-3", className)}>
      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {(["stt", "llm", "tool", "tts"] as SpanKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", SPAN_CLS[k])} />
            {SPAN_LABEL[k]}
          </span>
        ))}
      </div>

      <div className="space-y-2.5">
        {turns.map((turn) => {
          const ttfwPct = (turn.ttfwMs / axisMax) * 100;
          return (
            <div key={turn.idx} className="flex items-center gap-3">
              <span className="w-12 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                Turn {turn.idx}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-secondary">
                {/* spans */}
                <div className="absolute inset-0 flex">
                  {turn.spans.map((s, i) => (
                    <div
                      key={i}
                      className={cn("h-full", SPAN_CLS[s.kind])}
                      style={{ width: `${(s.durationMs / axisMax) * 100}%` }}
                      title={`${SPAN_LABEL[s.kind] ?? s.kind}: ${formatMs(s.durationMs)}`}
                    />
                  ))}
                </div>
                {/* TTFW marker */}
                <div
                  className="absolute inset-y-0 z-10 w-px border-l border-dashed border-foreground/40"
                  style={{ left: `${ttfwPct}%` }}
                  title={`Time to first word: ${formatMs(turn.ttfwMs)}`}
                />
              </div>
              <span
                className={cn("w-14 shrink-0 text-right font-mono text-[10px] tabular-nums", latencyTextClass(turn.ttfwMs))}
                title="Time to first word"
              >
                {formatMs(turn.ttfwMs)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
