import type { WaterfallTurn } from "@/components/shared/trace-waterfall";
import type { SpanKind } from "@/lib/types";

/**
 * Group flat telemetry spans into the per-turn shape TraceWaterfall renders.
 * Pure (no React) — the report page imports this; the WaterfallTurn/WaterfallSpan
 * types stay declared on the component that draws them.
 *
 * Spans with kind "turn" define turn boundaries; child spans (stt/llm/tts/tool)
 * nest under whichever turn contains them. If no "turn" spans exist, every span is
 * folded into a single turn.
 */
export function spansToWaterfallTurns(
  spans: Array<{ kind: string; label: string; startMs: number; endMs: number; durationMs: number }>,
): WaterfallTurn[] {
  const turnSpans = spans.filter((s) => s.kind === "turn");
  if (turnSpans.length === 0 && spans.length > 0) {
    const total = Math.max(...spans.map((s) => s.endMs)) - Math.min(...spans.map((s) => s.startMs));
    const ttfw = spans.find((s) => s.kind === "stt")?.durationMs ?? 0;
    return [
      {
        idx: 1,
        spans: spans.map((s) => ({
          kind: s.kind as SpanKind,
          label: s.label,
          startMs: s.startMs,
          durationMs: s.durationMs,
        })),
        ttfwMs: ttfw,
        totalMs: total,
      },
    ];
  }
  return turnSpans.map((t, i) => {
    const children = spans.filter(
      (s) => s.kind !== "turn" && s.startMs >= t.startMs && s.endMs <= t.endMs,
    );
    const ttfw = children.find((s) => s.kind === "stt")?.durationMs ?? 0;
    return {
      idx: i + 1,
      spans: children.map((s) => ({
        kind: s.kind as SpanKind,
        label: s.label,
        startMs: s.startMs,
        durationMs: s.durationMs,
      })),
      ttfwMs: ttfw,
      totalMs: t.durationMs,
    };
  });
}
