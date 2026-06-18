"use client";

import * as React from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { CheckCircle, FileText, ShieldCheck } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import { bookingFromStructuredData } from "@/lib/calls/booking";
import { PRESETS, getPreset } from "@/lib/data/presets";
import { useBudgetState } from "@/lib/data";
import { useVisitorKey } from "@/lib/hooks/use-visitor-key";
import { DEFAULT_PIPELINE, buildAssistant, buildAssistantFromConvexBusiness, type PipelineSelection } from "@/lib/vapi/assistant";
import { DocUploader, type UploadState } from "@/components/try/doc-uploader";
import { BusinessForm } from "@/components/try/business-form";
import { TextPaste } from "@/components/try/text-paste";
import { UrlInput } from "@/components/try/url-input";
import { useVapiCall } from "@/lib/vapi/use-vapi-call";

import { AgentStage } from "@/components/try/agent-stage";
import { CallController } from "@/components/try/call-controller";
import { PipelineSelector } from "@/components/try/pipeline-selector";
import { CallTimeline } from "@/components/shared/call-timeline";
import { AppointmentCard } from "@/components/shared/appointment-card";
import { BudgetMeter } from "@/components/shared/budget-meter";
import {
  ConsentDialog,
  DailyBudgetPanel,
  DemoBusyPanel,
  MicPermissionPanel,
  TotalBudgetPanel,
} from "@/components/states/guard-panels";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";

const SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site") ??
  "";
const WEBHOOK_URL = SITE_URL ? `${SITE_URL}/vapi/webhook` : undefined;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

export default function TryPage() {
  const [presetId, setPresetId] = React.useState(PRESETS[0].id);
  const [pipeline, setPipeline] = React.useState<PipelineSelection>(DEFAULT_PIPELINE);
  const [consentOpen, setConsentOpen] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [lastCallId, setLastCallId] = React.useState<string | null>(null);
  // Drives a reactive subscription to the call record so a booking captured
  // mid-call (book_appointment patches structuredData) surfaces inline at once.
  const [trackedCallId, setTrackedCallId] = React.useState<string | null>(null);
  const consentedRef = React.useRef(false);
  const activeCallIdRef = React.useRef<string | null>(null);
  const [sessionId] = React.useState(() => crypto.randomUUID());

  const call = useVapiCall();
  const budget = useBudgetState();
  const visitorKey = useVisitorKey();
  const businesses = useQuery(api.businesses.listPresets);
  const guard = useQuery(api.guard.canStartCall, {});
  const trackedCall = useQuery(
    api.calls.getById,
    trackedCallId ? { callId: trackedCallId as Id<"calls">, visitorKey } : "skip",
  );
  const booking = bookingFromStructuredData(trackedCall?.structuredData);

  const [mode, setMode] = React.useState<"preset" | "custom">("preset");
  const [customSource, setCustomSource] = React.useState<"upload" | "paste" | "link" | "form">("upload");
  const [uploadState, setUploadState] = React.useState<UploadState>({ status: "idle" });

  const startCallM = useMutation(api.calls.startCall);
  const attachVapiIdM = useMutation(api.calls.attachVapiId);
  const endCallM = useMutation(api.lifecycle.endCall);
  const generateUploadUrlM = useMutation(api.businesses.generateUploadUrl);
  const ingestDocumentA = useAction(api.ingest.ingestDocument);
  const ingestTextA = useAction(api.sources.ingestText);
  const ingestUrlA = useAction(api.sources.ingestUrl);
  const generateFromFormA = useAction(api.sources.generateFromForm);
  const uploadedBizQ = useQuery(
    api.businesses.getWithChunks,
    uploadState.status === "ready" ? { businessId: uploadState.businessId as Id<"businesses"> } : "skip",
  );

  const preset = getPreset(presetId)!;
  const blocked = !!guard && !guard.allowed;
  const ready =
    mode === "preset"
      ? !!businesses && !!visitorKey
      : !!visitorKey && uploadState.status === "ready" && !!uploadedBizQ;

  const handleIngest = React.useCallback(
    async (file: File) => {
      setUploadState({ status: "uploading", progress: 0 });
      try {
        const uploadUrl = await generateUploadUrlM({});
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = await res.json();
        setUploadState({ status: "analyzing" });
        const { businessId } = await ingestDocumentA({
          storageId,
          sessionId,
          fileName: file.name,
          mimeType: file.type || "text/plain",
        });
        setUploadState({ status: "ready", businessId, fileName: file.name });
      } catch (e) {
        setUploadState({
          status: "error",
          message:
            e instanceof Error
              ? e.message
              : "Couldn't read that file — try another or pick a preset.",
        });
      }
    },
    [generateUploadUrlM, ingestDocumentA, sessionId],
  );

  const handlePasteText = React.useCallback(
    async (text: string) => {
      setUploadState({ status: "analyzing" });
      try {
        const { businessId } = await ingestTextA({ sessionId, text });
        setUploadState({ status: "ready", businessId, fileName: "Pasted text" });
      } catch (e) {
        setUploadState({
          status: "error",
          message:
            e instanceof Error ? e.message : "Couldn't process that text — try another source.",
        });
      }
    },
    [ingestTextA, sessionId],
  );

  const handleIngestUrl = React.useCallback(
    async (url: string) => {
      setUploadState({ status: "analyzing" });
      try {
        const { businessId } = await ingestUrlA({ sessionId, url });
        const domain = new URL(url).hostname;
        setUploadState({ status: "ready", businessId, fileName: domain });
      } catch (e) {
        setUploadState({
          status: "error",
          message:
            e instanceof Error ? e.message : "Couldn't fetch that URL — try pasting text instead.",
        });
      }
    },
    [ingestUrlA, sessionId],
  );

  const handleGenerateFromForm = React.useCallback(
    async (data: { companyName: string; industry: string; description: string }) => {
      setUploadState({ status: "analyzing" });
      try {
        const { businessId } = await generateFromFormA({ sessionId, ...data });
        setUploadState({ status: "ready", businessId, fileName: data.companyName });
      } catch (e) {
        setUploadState({
          status: "error",
          message:
            e instanceof Error ? e.message : "Couldn't generate guidelines — try again.",
        });
      }
    },
    [generateFromFormA, sessionId],
  );

  const beginCall = React.useCallback(async () => {
    setStartError(null);
    if (!visitorKey) return;

    if (mode !== "preset") {
      if (!uploadedBizQ || uploadState.status !== "ready") return;
      try {
        const callId = await startCallM({
          sessionId,
          businessId: uploadedBizQ._id,
          visitorKey,
          sttProvider: pipeline.sttId,
          ttsProvider: pipeline.ttsId,
          llmProvider: pipeline.llmId,
        });
        activeCallIdRef.current = callId;
        setTrackedCallId(callId);
        const assistant = buildAssistantFromConvexBusiness(uploadedBizQ, pipeline, {
          webhookUrl: WEBHOOK_URL,
          toolBaseUrl: SITE_URL || undefined,
          secret: PUBLIC_KEY,
        });
        const vapiCallId = await call.start(assistant, callId, sessionId);
        if (vapiCallId) {
          await attachVapiIdM({ callId, vapiCallId });
        } else {
          await endCallM({ callId, reason: "start_failed" });
          activeCallIdRef.current = null;
        }
      } catch (e) {
        setStartError(e instanceof Error ? e.message : "Couldn't start the call.");
        activeCallIdRef.current = null;
      }
      return;
    }

    // Preset mode
    const business = businesses?.find((b) => b.name === preset.name);
    if (!business) return;
    try {
      const callId = await startCallM({
        sessionId,
        businessId: business._id,
        visitorKey,
        sttProvider: pipeline.sttId,
        ttsProvider: pipeline.ttsId,
        llmProvider: pipeline.llmId,
      });
      activeCallIdRef.current = callId;
      setTrackedCallId(callId);
      const assistant = buildAssistant(preset, pipeline, {
        webhookUrl: WEBHOOK_URL,
        toolBaseUrl: SITE_URL || undefined,
        secret: PUBLIC_KEY,
        businessId: business._id,
      });
      const vapiCallId = await call.start(assistant, callId, sessionId);
      if (vapiCallId) {
        await attachVapiIdM({ callId, vapiCallId });
      } else {
        // Start failed: the webhook will never fire, so release the slot now.
        await endCallM({ callId, reason: "start_failed" });
        activeCallIdRef.current = null;
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Couldn't start the call.");
      activeCallIdRef.current = null;
    }
  }, [
    mode,
    uploadedBizQ,
    uploadState,
    businesses,
    preset,
    visitorKey,
    sessionId,
    pipeline,
    startCallM,
    call,
    attachVapiIdM,
    endCallM,
  ]);

  React.useEffect(() => {
    if (call.status === "ended" && activeCallIdRef.current) {
      setLastCallId(activeCallIdRef.current);
    }
  }, [call.status]);

  const handleTalk = () => {
    if (call.status === "ended") {
      call.reset();
      setTrackedCallId(null);
    }
    if (blocked || !ready) return;
    if (!consentedRef.current) {
      setConsentOpen(true);
      return;
    }
    void beginCall();
  };

  const micDenied = !!call.error && /denied|permission|notallowed/i.test(call.error);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
      {/* Global status strip */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-4 py-2 font-mono text-xs text-muted-foreground">
        <span>
          <span className="text-foreground tabular-nums">{budget.activeCalls}</span> of {budget.maxConcurrent} lines live
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span>
          est. <span className="text-foreground tabular-nums">{formatUsd(budget.totalSpentUsd)}</span> / {formatUsd(budget.totalCapUsd, 0)} today
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[27%_46%_27%]">
        {/* LEFT — Setup */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            {/* Top toggle: Presets | Custom */}
            <div className="mb-3 flex rounded-lg border p-0.5">
              <button
                onClick={() => setMode("preset")}
                className={cn(
                  "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                  mode === "preset"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Presets
              </button>
              <button
                onClick={() => setMode("custom")}
                className={cn(
                  "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                  mode === "custom"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Custom
              </button>
            </div>

            {/* Sub-selector (only in custom mode) */}
            {mode === "custom" && (
              <div className="mb-3 flex rounded-md border bg-muted p-0.5">
                {(["upload", "paste", "link", "form"] as const).map((src) => (
                  <button
                    key={src}
                    onClick={() => {
                      setCustomSource(src);
                      setUploadState({ status: "idle" });
                    }}
                    className={cn(
                      "flex-1 rounded py-0.5 text-[11px] font-medium capitalize transition-colors",
                      customSource === src
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {src === "upload" ? "Upload" : src === "paste" ? "Paste" : src === "link" ? "Link" : "Form"}
                  </button>
                ))}
              </div>
            )}

            {mode === "preset" ? (
              <div className="space-y-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPresetId(p.id)}
                    disabled={call.status === "live" || call.status === "connecting"}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
                      presetId === p.id ? "border-primary bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <FileText className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.services.slice(0, 3).join(" · ")}
                      </p>
                    </div>
                    {presetId === p.id && <CheckCircle className="ml-auto size-4 text-primary" />}
                  </button>
                ))}
              </div>
            ) : customSource === "upload" ? (
              <DocUploader
                onIngest={handleIngest}
                state={uploadState}
                disabled={call.status === "live" || call.status === "connecting"}
              />
            ) : customSource === "paste" ? (
              <TextPaste
                onSubmit={handlePasteText}
                state={uploadState}
                disabled={call.status === "live" || call.status === "connecting"}
              />
            ) : customSource === "link" ? (
              <UrlInput
                onSubmit={handleIngestUrl}
                state={uploadState}
                disabled={call.status === "live" || call.status === "connecting"}
              />
            ) : (
              <BusinessForm
                onSubmit={handleGenerateFromForm}
                state={uploadState}
                disabled={call.status === "live" || call.status === "connecting"}
              />
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {mode !== "preset" && uploadedBizQ ? uploadedBizQ.companyName : preset.name}
              </h2>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {mode !== "preset" && uploadedBizQ ? uploadedBizQ.chunks.length : preset.chunkCount} chunks
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode !== "preset" && uploadedBizQ ? uploadedBizQ.hours : preset.hours}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(mode !== "preset" && uploadedBizQ ? uploadedBizQ.services : preset.services).map((s) => (
                <span key={s} className="rounded-md border bg-muted px-2 py-0.5 text-[11px]">{s}</span>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Voice pipeline</h2>
            <PipelineSelector value={pipeline} onChange={setPipeline} liveCall={call.status === "live"} />
          </section>
        </div>

        {/* CENTER — Live stage */}
        <div className="flex min-h-[640px] flex-col rounded-xl border bg-card">
          {blocked && (
            <div className="p-4">
              {guard?.reason === "concurrency" && <DemoBusyPanel slots={budget.maxConcurrent} />}
              {guard?.reason === "daily_budget" && <DailyBudgetPanel />}
              {guard?.reason === "total_budget" && <TotalBudgetPanel />}
            </div>
          )}
          {micDenied && (
            <div className="p-4">
              <MicPermissionPanel denied onRequest={() => void beginCall()} />
            </div>
          )}
          <AgentStage status={call.status} volume={call.volume} agentSpeaking={call.agentSpeaking} />
          <div className="border-t p-5">
            <CallController
              status={call.status}
              secondsLeft={call.secondsLeft}
              muted={call.muted}
              disabled={blocked || !ready}
              reportHref={lastCallId ? `/calls/${lastCallId}` : undefined}
              onTalk={handleTalk}
              onEnd={call.stop}
              onToggleMute={call.toggleMute}
            />
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
                title={call.status === "idle" ? "Transcript appears here" : "Listening…"}
                description={call.status === "idle" ? "Press Talk to start the conversation." : undefined}
              />
            ) : (
              <CallTimeline turns={call.turns} className="h-full max-h-[260px]" />
            )}
          </div>
        </div>

        {/* RIGHT — Live trace */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Budget guard</h2>
            <BudgetMeter budget={budget} estimate />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Live trace</h2>
            {call.status === "live" ? (
              <p className="font-mono text-xs text-muted-foreground">
                Streaming {call.turns.length} turn{call.turns.length === 1 ? "" : "s"}. The full breakdown appears in your post-call report.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Timing details appear here once the call starts.
              </p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Guardrails</h2>
            <p className="mb-2 text-[11px] text-muted-foreground">Guarded against:</p>
            <div className="flex flex-wrap gap-1.5">
              {["Injection", "Hallucination", "Stay-in-role", "Abuse"].map((g) => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="size-3" aria-hidden />
                  {g}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>

      <ConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onAccept={() => {
          consentedRef.current = true;
          void beginCall();
        }}
      />
    </div>
  );
}
