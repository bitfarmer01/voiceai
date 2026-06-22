"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTryCall } from "@/lib/vapi/use-try-call";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConsentDialog } from "@/components/states/guard-panels";
import { CallStage } from "@/components/try/stages/call-stage";
import { PostCallReport } from "@/components/app/post-call-report";
import { EmptyState } from "@/components/states/empty-state";
import { ReceptionistChat } from "@/components/chat/receptionist-chat";

type Stage = "pre-call" | "in-call" | "post-call";

/**
 * AppDemoClient — the visitor stage machine for /app/[slug]: pre-call (optional
 * micro-context) → in-call (shared CallStage) → post-call (inline transcript +
 * analytics). The configured business is loaded by slug; all call orchestration lives
 * in useTryCall. The post-call view is render-derived from the ended status so "Call
 * again" naturally returns to pre-call.
 */
export function AppDemoClient({ slug }: { slug: string }) {
  const biz = useQuery(api.businesses.getBySlug, { slug });
  const tc = useTryCall();
  const [stage, setStage] = React.useState<Stage>("pre-call");
  const [callerContext, setCallerContext] = React.useState("");

  // Consent gate — ask once per session (same pattern as /try).
  const [consentOpen, setConsentOpen] = React.useState(false);
  const consentedRef = React.useRef(false);
  const pendingStartRef = React.useRef<(() => void) | null>(null);

  const requestStart = React.useCallback(
    (startFn: () => void) => {
      if (tc.blocked) return;
      if (!consentedRef.current) {
        pendingStartRef.current = startFn;
        setConsentOpen(true);
        return;
      }
      startFn();
    },
    [tc.blocked],
  );

  // A finished call surfaces its report; derived during render, not via an effect.
  const view: Stage =
    stage === "in-call" && tc.call.status === "ended" ? "post-call" : stage;

  if (biz === undefined) return <AppSkeleton />;
  if (biz === null) {
    return (
      <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center px-4">
        <EmptyState
          title="This demo isn't ready yet"
          description="Check the link, or ask whoever shared it to finish setting it up."
        />
      </div>
    );
  }

  const startCall = (ctx?: string) => {
    setStage("in-call");
    requestStart(() => void tc.beginBusiness(biz, { callerContext: ctx }));
  };

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {view === "pre-call" && (
        <PreCall
          businessName={biz.profile.companyName}
          context={callerContext}
          onContextChange={setCallerContext}
          onStart={() => startCall(callerContext.trim() || undefined)}
          onSkip={() => startCall(undefined)}
        />
      )}

      {view === "in-call" && (
        <CallStage
          variant="your"
          businessName={biz.profile.companyName}
          call={tc.call}
          booking={tc.booking}
          startError={tc.startError}
          blocked={tc.blocked}
          guardReason={tc.guardReason}
          budget={tc.budget}
          pipeline={tc.pipeline}
          onPipelineChange={tc.setPipeline}
          onTalk={() => startCall(callerContext.trim() || undefined)}
          onEnd={tc.call.stop}
          onToggleMute={tc.call.toggleMute}
          services={biz.profile.services}
          hoursText={biz.profile.hours}
          chunks={tc.chunks}
          usedChunkIds={tc.usedChunkIds}
        />
      )}

      {view === "post-call" && (
        <PostCallReport
          businessName={biz.profile.companyName}
          turns={tc.call.turns}
          report={tc.trackedCall ? { durationSec: tc.trackedCall.durationSec, costUsd: tc.trackedCall.costUsd, ttfwMs: tc.trackedCall.ttfwMs } : tc.trackedCall}
          onCallAgain={() => {
            tc.resetCall();
            setCallerContext("");
            setStage("pre-call");
          }}
        />
      )}

      <ConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onAccept={() => {
          consentedRef.current = true;
          setConsentOpen(false);
          const fn = pendingStartRef.current;
          pendingStartRef.current = null;
          fn?.();
        }}
      />

      <ReceptionistChat
        businessId={biz._id}
        businessName={biz.profile.companyName}
        knowledge={[
          `Company: ${biz.profile.companyName}`,
          `Hours: ${biz.profile.hours}`,
          `Services: ${biz.profile.services.join(", ")}`,
          ...(biz.profile.policies?.length ? [`Policies: ${biz.profile.policies.join("; ")}`] : []),
          ...(biz.profile.availability ? [`Availability: ${biz.profile.availability}`] : []),
        ].join("\n")}
        callerContext={callerContext.trim() || undefined}
      />
    </div>
  );
}

function PreCall({
  businessName,
  context,
  onContextChange,
  onStart,
  onSkip,
}: {
  businessName: string;
  context: string;
  onContextChange: (v: string) => void;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Live demo</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
        Talk to {businessName}
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        You&apos;ll have a quick 2-minute call with the receptionist. Ask about hours, services, or book an appointment.
      </p>

      <label htmlFor="caller-context" className="mt-7 block text-sm font-medium">
        Anything you&apos;d like the receptionist to know before we start?
        <span className="ml-1.5 font-normal text-muted-foreground">— optional</span>
      </label>
      <Textarea
        id="caller-context"
        value={context}
        onChange={(e) => onContextChange(e.target.value)}
        placeholder="e.g. I'm a new patient with a billing question"
        className="mt-1.5 min-h-[88px]"
      />

      <div className="mt-6 flex flex-col gap-2.5">
        <Button className="w-full" onClick={onStart}>
          Start call
        </Button>
        <Button variant="outline" className="w-full" onClick={onSkip}>
          Skip &amp; call
        </Button>
      </div>
    </div>
  );
}

function AppSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="mt-3 h-8 w-3/4 rounded bg-muted" />
      <div className="mt-2 h-4 w-full rounded bg-muted" />
      <div className="mt-7 h-24 w-full rounded-lg bg-muted" />
      <div className="mt-6 h-9 w-full rounded-lg bg-muted" />
    </div>
  );
}
