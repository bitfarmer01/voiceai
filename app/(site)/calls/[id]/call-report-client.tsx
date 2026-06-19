"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { ArrowLeft } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatUsd, formatDuration, formatMs, formatDateTime } from "@/lib/format";
import { bookingFromStructuredData } from "@/lib/calls/booking";
import { CALL_OUTCOME } from "@/lib/calls/outcome";
import { spansToWaterfallTurns } from "@/lib/calls/trace";
import { AppointmentCard } from "@/components/shared/appointment-card";
import { TraceWaterfall } from "@/components/shared/trace-waterfall";
import { CostBreakdown } from "@/components/shared/cost-breakdown";
import { QualityMetricsPanel } from "@/components/shared/quality-metrics";
import { CallTimeline } from "@/components/shared/call-timeline";
import { StarRating } from "@/components/shared/star-rating";
import { EmptyState } from "@/components/states/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TechnicalOnly } from "@/lib/view-mode";
import { useVisitorKey } from "@/lib/hooks/use-visitor-key";
import type { TranscriptTurn, CallOutcome } from "@/lib/types";

export function CallReportClient({ id }: { id: string }) {
  const callId = id as Id<"calls">;
  const visitorKey = useVisitorKey();
  const [rated, setRated] = React.useState(0);
  const [rateSubmitted, setRateSubmitted] = React.useState(false);

  // Ownership-gated (M2): getById only returns the PII-bearing call record to the
  // visitor who owns it. We pass the persisted per-browser visitorKey that
  // startCall stored on the call row, so the owner sees their report while a third
  // party who opens the link (different visitorKey) gets null → "call not found".
  // Gate on a non-empty key ("skip" until useVisitorKey hydrates) so the owner
  // doesn't see a one-frame "Call not found" flash before the real key loads.
  const call = useQuery(
    api.calls.getById,
    visitorKey ? { callId, visitorKey } : "skip",
  );
  const spans = useQuery(api.spans.listByTrace, { traceId: id });
  const turns = useQuery(api.transcriptTurns.listByCall, { callId });
  const rateMutation = useMutation(api.voiceRatings.rate);

  const handleRate = async (stars: number) => {
    if (!call || rateSubmitted) return;
    setRated(stars);
    await rateMutation({
      callId,
      stars,
      ttsProvider: call.ttsProvider,
      ttsVoice: call.ttsVoice,
      visitorKey: visitorKey || undefined,
    });
    setRateSubmitted(true);
  };

  if (call === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (call === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <EmptyState
          title="Call not found"
          description="This call may have expired, or it belongs to a different visitor."
          action={{ label: "Back to recent calls", href: "/calls" }}
        />
      </div>
    );
  }

  // `call` is the typed non-PII projection from api.calls.getById (one owner of the
  // report shape); no hand-maintained cast needed.
  const c = call;

  const outcomeKey: CallOutcome = c.outcome ?? "abandoned";
  const o = CALL_OUTCOME[outcomeKey];
  const OutcomeIcon = o.icon;

  const waterfallTurns = spansToWaterfallTurns(spans ?? []);
  const transcriptTurns: TranscriptTurn[] = (turns ?? []).map((t) => ({
    idx: t.idx,
    role: t.role as TranscriptTurn["role"],
    text: t.text,
    ts: t.ts,
  }));
  const booking = bookingFromStructuredData(c.structuredData);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Recent calls
      </Link>

      {/* Header — plain outcome, business, time */}
      <div className="mt-4 mb-6 flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted">
          <OutcomeIcon className={`size-5 ${o.iconClass}`} aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-balance">{o.headline}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {c.businessName} · {formatDateTime(c.startedAt)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* What happened — the owner's headline takeaway */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold">What happened</h2>
          <p className="text-sm text-muted-foreground">{o.summary}</p>
          {c.summary ? (
            <p className="mt-3 text-sm text-pretty text-foreground leading-relaxed">{c.summary}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground italic">
              A short summary of this call isn’t available.
            </p>
          )}
        </section>

        {/* Booking — what an owner cares about most */}
        {booking != null && (
          <section className="rounded-xl border bg-card p-5">
            <AppointmentCard booking={booking} />
          </section>
        )}

        {/* What was said — plain transcript */}
        {transcriptTurns.length > 0 && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">What was said</h2>
            <CallTimeline turns={transcriptTurns} className="max-h-[360px]" />
          </section>
        )}

        {/* Voice rating */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold">How did the voice sound?</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Your rating helps us pick the most natural-sounding voice.
          </p>
          <StarRating value={rated} onChange={handleRate} disabled={rateSubmitted} />
          {rateSubmitted && <p className="mt-2 text-xs text-success">Thanks for rating!</p>}
        </section>

        {/* Behind the scenes — engineering detail, only in technical view */}
        <TechnicalOnly>
          <div className="space-y-4 border-t pt-6">
            <div>
              <h2 className="text-sm font-semibold">Behind the scenes</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Timing, cost, and quality detail for this call.
              </p>
            </div>

            {/* Headline numbers */}
            <section className="rounded-xl border bg-card p-5">
              <dl className="grid grid-cols-3 gap-3 font-mono text-xs">
                <div>
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="tabular-nums text-foreground">{formatDuration(c.durationSec)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">First word</dt>
                  <dd className="tabular-nums text-foreground">{formatMs(c.ttfwMs ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cost</dt>
                  <dd className="tabular-nums text-foreground">{formatUsd(c.costUsd, 3)}</dd>
                </div>
              </dl>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-xl border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold">Trace waterfall</h3>
                {waterfallTurns.length > 0 ? (
                  <TraceWaterfall turns={waterfallTurns} />
                ) : (
                  <EmptyState
                    title="No spans recorded"
                    description="Spans are written async after the call. Refresh in a few seconds."
                  />
                )}
              </section>

              <div className="space-y-4">
                <section className="rounded-xl border bg-card p-5">
                  <h3 className="mb-4 text-sm font-semibold">Cost breakdown</h3>
                  <CostBreakdown cost={c.costBreakdown} />
                </section>

                <section className="rounded-xl border bg-card p-5">
                  <h3 className="mb-4 text-sm font-semibold">Call quality</h3>
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
                  <h3 className="mb-3 text-sm font-semibold">Pipeline</h3>
                  <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                    {[
                      ["STT", c.sttProvider],
                      ["TTS", c.ttsProvider + (c.ttsVoice ? ` · ${c.ttsVoice}` : "")],
                      ["LLM", c.llmProvider],
                      ["Language", c.languages.join(", ") || "en"],
                    ].map(([k, val]) => (
                      <React.Fragment key={k}>
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-foreground">{val}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </section>
              </div>
            </div>
          </div>
        </TechnicalOnly>
      </div>
    </div>
  );
}
