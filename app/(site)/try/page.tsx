"use client";

import * as React from "react";
import { PRESETS } from "@/lib/data/presets";
import type { ConvexBusinessForAssistant } from "@/lib/vapi/assistant";
import { useTryCall } from "@/lib/vapi/use-try-call";
import { ConsentDialog } from "@/components/states/guard-panels";
import { EntryFork } from "@/components/try/stages/entry-fork";
import { CallStage } from "@/components/try/stages/call-stage";
import { GuidedForm } from "@/components/try/stages/guided-form";
import { Recap } from "@/components/try/stages/recap";

type Stage = "entry" | "demo-call" | "demo-recap" | "form" | "your-call" | "your-recap";

/** The demo everyone hears first — the default preset (Glow Dental). */
const DEMO_PRESET = PRESETS[0];

/**
 * TryPage — a thin guided-journey stage machine. The entry fork sends the user
 * down the demo branch (hear Glow Dental → recap → build) or straight to the
 * guided form, which builds their own receptionist and calls it. All call
 * orchestration lives in `useTryCall`; the stage components stay presentational.
 */
export default function TryPage() {
  const tc = useTryCall();
  const [stage, setStage] = React.useState<Stage>("entry");
  const [yourBiz, setYourBiz] = React.useState<ConvexBusinessForAssistant | null>(null);

  // Consent gate: ask once, then remember for the session.
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

  const reportHref = tc.lastCallId ? `/calls/${tc.lastCallId}` : undefined;

  // Derive the shown stage: a finished call surfaces its recap. Derived during
  // render (not synced via an effect) so "call again" — which resets the call to
  // idle and sets the stage back — naturally returns to the call surface.
  const view: Stage =
    stage === "demo-call" && tc.call.status === "ended"
      ? "demo-recap"
      : stage === "your-call" && tc.call.status === "ended"
        ? "your-recap"
        : stage;

  const startDemo = () => requestStart(() => void tc.beginDemo(DEMO_PRESET));
  const startYour = (biz: ConvexBusinessForAssistant) => requestStart(() => void tc.beginBusiness(biz));

  const goHearDemo = () => {
    tc.resetCall();
    setStage("demo-call");
    startDemo();
  };
  const goBuild = () => {
    tc.resetCall();
    setStage("form");
  };
  const onFormReady = (biz: ConvexBusinessForAssistant) => {
    setYourBiz(biz);
    setStage("your-call");
    startYour(biz);
  };

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {view === "entry" && <EntryFork onHearDemo={goHearDemo} onBuild={goBuild} />}

      {(view === "demo-call" || view === "your-call") && (
        <CallStage
          variant={view === "demo-call" ? "demo" : "your"}
          businessName={
            view === "demo-call" ? DEMO_PRESET.name : yourBiz?.profile.companyName ?? "Your business"
          }
          call={tc.call}
          booking={tc.booking}
          startError={tc.startError}
          blocked={tc.blocked}
          guardReason={tc.guardReason}
          budget={tc.budget}
          pipeline={tc.pipeline}
          onPipelineChange={tc.setPipeline}
          onTalk={() => (view === "demo-call" ? startDemo() : yourBiz && startYour(yourBiz))}
          onEnd={tc.call.stop}
          onToggleMute={tc.call.toggleMute}
        />
      )}

      {view === "demo-recap" && (
        <Recap
          variant="demo"
          businessName={DEMO_PRESET.name}
          booking={tc.booking}
          messageCount={tc.call.turns.length}
          reportHref={reportHref}
          onBuild={goBuild}
          onCallAgain={goHearDemo}
        />
      )}

      {view === "form" && <GuidedForm sessionId={tc.sessionId} onReady={onFormReady} />}

      {view === "your-recap" && (
        <Recap
          variant="your"
          businessName={yourBiz?.profile.companyName ?? "your business"}
          booking={tc.booking}
          messageCount={tc.call.turns.length}
          reportHref={reportHref}
          onCallAgain={() => {
            if (!yourBiz) return;
            tc.resetCall();
            setStage("your-call");
            startYour(yourBiz);
          }}
          onEdit={goBuild}
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
    </div>
  );
}
