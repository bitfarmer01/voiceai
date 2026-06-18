"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { ArrowLeft } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatUsd, formatDuration, formatMs } from "@/lib/format";
import { bookingFromStructuredData } from "@/lib/calls/booking";
import { AppointmentCard } from "@/components/shared/appointment-card";
import { TraceWaterfall } from "@/components/shared/trace-waterfall";
import type { WaterfallTurn } from "@/components/shared/trace-waterfall";
import { CostBreakdown } from "@/components/shared/cost-breakdown";
import { QualityMetricsPanel } from "@/components/shared/quality-metrics";
import { CallTimeline } from "@/components/shared/call-timeline";
import { StarRating } from "@/components/shared/star-rating";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useVisitorKey } from "@/lib/hooks/use-visitor-key";
import type { SpanKind, TranscriptTurn } from "@/lib/types";

function spansToWaterfallTurns(
  spans: Array<{ kind: string; label: string; startMs: number; endMs: number; durationMs: number }>,
): WaterfallTurn[] {
  // Group spans by turn — spans with kind "turn" define turn boundaries;
  // child spans (stt/llm/tts/tool) are nested under them.
  // If no "turn" spans exist, treat all spans as one turn.
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

export function CallReportClient({ id }: { id: string }) {
  const callId = id as Id<"calls">;
  const visitorKey = useVisitorKey();
  const [rated, setRated] = React.useState(0);
  const [rateSubmitted, setRateSubmitted] = React.useState(false);

  const call = useQuery(api.calls.getById, { callId });
  const spans = useQuery(api.spans.listByTrace, { traceId: id });
  const turns = useQuery(api.transcriptTurns.listByCall, { callId });
  const rateMutation = useMutation(api.voiceRatings.rate);

  const handleRate = async (stars: number) => {
    if (!call || rateSubmitted) return;
    setRated(stars);
    await rateMutation({
      callId,
      stars,
      ttsProvider: (call as { ttsProvider?: string }).ttsProvider ?? "",
      ttsVoice: (call as { ttsVoice?: string }).ttsVoice,
      visitorKey: visitorKey || undefined,
    });
    setRateSubmitted(true);
  };

  if (call === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (call === null) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <EmptyState title="Call not found" description="This call may have expired or never existed." />
      </div>
    );
  }

  const c = call as {
    _id: string;
    businessName: string;
    status: string;
    outcome?: string;
    durationSec: number;
    costUsd: number;
    costBreakdown: { stt: number; llm: number; tts: number; platform: number };
    sttProvider: string;
    ttsProvider: string;
    ttsVoice?: string;
    llmProvider: string;
    languages: string[];
    startedAt: number;
    ttfwMs?: number;
    summary?: string;
    structuredData?: unknown;
    qualityMetrics?: {
      talkRatio: number;
      interruptions: number;
      deadAirSec: number;
      wpm: number;
      sentiment?: number;
    };
  };

  const waterfallTurns = spansToWaterfallTurns(spans ?? []);
  const transcriptTurns: TranscriptTurn[] = (turns ?? []).map((t) => ({
    idx: t.idx,
    role: t.role as TranscriptTurn["role"],
    text: t.text,
    ts: t.ts,
  }));
  const booking = bookingFromStructuredData(c.structuredData);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Recent calls
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{c.businessName}</h1>
        <Badge variant={c.outcome === "booked" ? "default" : "secondary"}>
          {c.outcome ?? "abandoned"}
        </Badge>
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(c.startedAt).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT — summary, booking, transcript, rating */}
        <div className="space-y-4">
          {/* Summary */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Summary</h2>
            {c.summary ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{c.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Summary not available.</p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 font-mono text-xs">
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="tabular-nums text-foreground">{formatDuration(c.durationSec)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">TTFW</p>
                <p className="tabular-nums text-foreground">{formatMs(c.ttfwMs ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost</p>
                <p className="tabular-nums text-foreground">{formatUsd(c.costUsd, 3)}</p>
              </div>
            </div>
          </section>

          {/* Booking */}
          {booking != null && (
            <section className="rounded-xl border bg-card p-5">
              <AppointmentCard booking={booking} />
            </section>
          )}

          {/* Transcript */}
          {transcriptTurns.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Transcript</h2>
              <CallTimeline turns={transcriptTurns} className="max-h-[320px]" />
            </section>
          )}

          {/* Voice rating */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Rate the voice</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Rating {c.ttsProvider}{c.ttsVoice ? ` · ${c.ttsVoice}` : ""}
            </p>
            <StarRating value={rated} onChange={handleRate} disabled={rateSubmitted} />
            {rateSubmitted && (
              <p className="mt-2 text-xs text-success">Thanks for rating!</p>
            )}
          </section>
        </div>

        {/* RIGHT — trace waterfall + cost breakdown */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Trace waterfall</h2>
            {waterfallTurns.length > 0 ? (
              <TraceWaterfall turns={waterfallTurns} />
            ) : (
              <EmptyState
                title="No spans recorded"
                description="Spans are written async after the call. Refresh in a few seconds."
              />
            )}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Cost breakdown</h2>
            <CostBreakdown cost={c.costBreakdown} />
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Call quality</h2>
            {c.qualityMetrics ? (
              <QualityMetricsPanel metrics={c.qualityMetrics} />
            ) : (
              <EmptyState
                title="No quality metrics"
                description="Metrics are computed when the call ends. Make a call to see them."
                action={{ label: "Make a call", href: "/try" }}
              />
            )}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Pipeline</h2>
            <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
              {[
                ["STT", c.sttProvider],
                ["TTS", c.ttsProvider + (c.ttsVoice ? ` · ${c.ttsVoice}` : "")],
                ["LLM", c.llmProvider],
                ["Language", c.languages.join(", ") || "en"],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
