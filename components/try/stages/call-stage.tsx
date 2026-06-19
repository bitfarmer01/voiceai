"use client";

import * as React from "react";
import { CaretDown, ShieldCheck } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { TechnicalOnly } from "@/lib/view-mode";
import type { PipelineSelection } from "@/lib/vapi/assistant";
import type { VapiCall } from "@/lib/vapi/use-vapi-call";
import type { Booking, BudgetState } from "@/lib/types";

import { AgentStage } from "@/components/try/agent-stage";
import { CallController } from "@/components/try/call-controller";
import { PipelineSelector } from "@/components/try/pipeline-selector";
import { CallTimeline } from "@/components/shared/call-timeline";
import { AppointmentCard } from "@/components/shared/appointment-card";
import { BudgetMeter } from "@/components/shared/budget-meter";
import {
  DailyBudgetPanel,
  DemoBusyPanel,
  MicPermissionPanel,
  TotalBudgetPanel,
} from "@/components/states/guard-panels";
import { EmptyState } from "@/components/states/empty-state";

const REASSURANCES = [
  "Answers only from your info",
  "Won't make things up",
  "Stays on your business",
  "Stays polite",
];

/**
 * CallStage — the full-screen, single-focus call surface shared by the demo and
 * your-business calls. Voice + plain status + transcript + an inline booking card,
 * with a quiet "Show details" toggle that reveals spending and the reassurance
 * chips (and, in Technical mode, the voice pipeline). No 3-column clutter.
 */
export function CallStage({
  variant,
  businessName,
  call,
  booking,
  startError,
  blocked,
  guardReason,
  budget,
  pipeline,
  onPipelineChange,
  onTalk,
  onEnd,
  onToggleMute,
}: {
  variant: "demo" | "your";
  businessName: string;
  call: VapiCall;
  booking: Booking | null;
  startError: string | null;
  blocked: boolean;
  guardReason: string | undefined;
  budget: BudgetState;
  pipeline: PipelineSelection;
  onPipelineChange: (p: PipelineSelection) => void;
  onTalk: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const micDenied = !!call.error && /denied|permission|notallowed/i.test(call.error);
  const ended = call.status === "ended";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {variant === "demo" ? "Sample call" : "Your receptionist"}
          </p>
          <h1 className="text-lg font-semibold tracking-tight">{businessName}</h1>
        </div>
      </div>

      <div className="flex min-h-[560px] flex-col rounded-2xl border bg-card">
        {blocked && (
          <div className="p-4">
            {guardReason === "concurrency" && <DemoBusyPanel slots={budget.maxConcurrent} />}
            {guardReason === "daily_budget" && <DailyBudgetPanel />}
            {guardReason === "total_budget" && <TotalBudgetPanel />}
          </div>
        )}
        {micDenied && (
          <div className="p-4">
            <MicPermissionPanel denied onRequest={onTalk} />
          </div>
        )}

        <AgentStage status={call.status} volume={call.volume} agentSpeaking={call.agentSpeaking} />

        <div className="border-t p-5">
          {ended ? (
            <p className="text-center text-sm text-muted-foreground">Wrapping up your summary…</p>
          ) : (
            <CallController
              status={call.status}
              secondsLeft={call.secondsLeft}
              muted={call.muted}
              disabled={blocked}
              onTalk={onTalk}
              onEnd={onEnd}
              onToggleMute={onToggleMute}
            />
          )}
          {startError && <p className="mt-3 text-center text-xs text-danger">{startError}</p>}
          {call.error && !micDenied && (
            <p className="mt-2 text-center text-xs text-danger">{call.error}</p>
          )}
        </div>

        {booking && (
          <div className="border-t p-5">
            <AppointmentCard booking={booking} />
          </div>
        )}

        <div className="min-h-0 flex-1 border-t p-4">
          {call.turns.length === 0 ? (
            <EmptyState
              title={call.status === "idle" ? "The conversation shows up here" : "Listening…"}
              description={
                call.status === "idle" ? "Press the call button to start the conversation." : undefined
              }
            />
          ) : (
            <CallTimeline turns={call.turns} className="h-full max-h-[260px]" />
          )}
        </div>
      </div>

      {/* Quiet "show details" — spending + reassurances (+ pipeline in Technical mode). */}
      <div className="rounded-xl border bg-card">
        <button
          onClick={() => setShowDetails((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={showDetails}
        >
          Show details
          <CaretDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} />
        </button>
        {showDetails && (
          <div className="space-y-4 border-t px-4 py-4">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Spending
              </h2>
              <BudgetMeter budget={budget} estimate />
            </div>
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stays on track
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {REASSURANCES.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <ShieldCheck className="size-3" aria-hidden />
                    {g}
                  </span>
                ))}
              </div>
            </div>
            <TechnicalOnly>
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Voice pipeline
                </h2>
                <PipelineSelector
                  value={pipeline}
                  onChange={onPipelineChange}
                  liveCall={call.status === "live"}
                />
              </div>
            </TechnicalOnly>
          </div>
        )}
      </div>
    </div>
  );
}
