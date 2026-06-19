"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { bookingFromStructuredData } from "@/lib/calls/booking";
import type { PresetBusiness } from "@/lib/data/presets";
import { useBudgetState } from "@/lib/data";
import { useVisitorKey } from "@/lib/hooks/use-visitor-key";
import {
  DEFAULT_PIPELINE,
  buildAssistant,
  buildAssistantFromConvexBusiness,
  type ConvexBusinessForAssistant,
  type PipelineSelection,
} from "@/lib/vapi/assistant";
import { useVapiCall, type VapiCall } from "@/lib/vapi/use-vapi-call";

const SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site") ??
  "";
const WEBHOOK_URL = SITE_URL ? `${SITE_URL}/vapi/webhook` : undefined;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

/**
 * Resolve the base URL VAPI's servers will POST the receptionist tools to.
 * Prefer the configured Convex site URL; fall back to the current origin so
 * deployed builds without NEXT_PUBLIC_CONVEX_SITE_URL still attach tools.
 * VAPI calls these server-to-server, so a localhost/private origin is
 * unreachable — warn honestly when we resolve to one.
 */
function resolveToolBaseUrl(): string | undefined {
  const base = SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return undefined;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/i.test(base)) {
    console.warn(
      `[try] Tool base URL resolves to a local/non-public origin (${base}); VAPI cannot reach it server-to-server, so the receptionist tools (availability, booking, lookup) will not run. Set NEXT_PUBLIC_CONVEX_SITE_URL to a public URL.`,
    );
  }
  return base;
}

/** A plain, spoken-friendly date label (e.g. "Thursday, June 18, 2026") for the prompt's date anchor. */
function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface TryCall {
  /** Underlying VAPI call state (status, volume, turns, secondsLeft, …). */
  call: VapiCall;
  /** Structured booking captured mid-call (Convex reactivity); null until one lands. */
  booking: ReturnType<typeof bookingFromStructuredData>;
  /** Most recent error starting a call (distinct from in-call SDK errors on `call.error`). */
  startError: string | null;
  /** The Convex call id of the just-ended call — drives the post-call report link. */
  lastCallId: string | null;
  /** guard.canStartCall result; `blocked` is the derived "can't start now" flag. */
  blocked: boolean;
  guardReason: string | undefined;
  budget: ReturnType<typeof useBudgetState>;
  visitorKey: string;
  sessionId: string;
  pipeline: PipelineSelection;
  setPipeline: (p: PipelineSelection) => void;
  /** True once the preset list has loaded (the demo can be started). */
  presetsReady: boolean;
  /** Start the demo call against a preset business (resolves its Convex id by name). */
  beginDemo: (preset: PresetBusiness) => Promise<void>;
  /** Start a call against an owner-built business. */
  beginBusiness: (biz: ConvexBusinessForAssistant) => Promise<void>;
  /** Reset the call back to idle (for "call again") without losing `lastCallId`. */
  resetCall: () => void;
}

/**
 * Owns all `/try` call orchestration so the demo and your-business calls share one
 * path and the stage components stay presentational. Wraps `useVapiCall` and the
 * Convex start/attach/end wiring, subscribes to the live call record for inline
 * bookings, and exposes `beginDemo` / `beginBusiness` keyed off the same pipeline.
 */
export function useTryCall(): TryCall {
  const [pipeline, setPipeline] = React.useState<PipelineSelection>(DEFAULT_PIPELINE);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [lastCallId, setLastCallId] = React.useState<string | null>(null);
  const [trackedCallId, setTrackedCallId] = React.useState<string | null>(null);
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

  const startCallM = useMutation(api.calls.startCall);
  const attachVapiIdM = useMutation(api.calls.attachVapiId);
  const endCallM = useMutation(api.lifecycle.endCall);

  const blocked = !!guard && !guard.allowed;

  const begin = React.useCallback(
    async (businessId: Id<"businesses">, assistant: unknown) => {
      try {
        const callId = await startCallM({
          sessionId,
          businessId,
          visitorKey,
          sttProvider: pipeline.sttId,
          ttsProvider: pipeline.ttsId,
          llmProvider: pipeline.llmId,
        });
        activeCallIdRef.current = callId;
        setTrackedCallId(callId);
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
    },
    [sessionId, visitorKey, pipeline, startCallM, call, attachVapiIdM, endCallM],
  );

  const beginDemo = React.useCallback(
    async (preset: PresetBusiness) => {
      setStartError(null);
      if (!visitorKey) return;
      const business = businesses?.find((b) => b.name === preset.name);
      if (!business) {
        setStartError("The demo isn't ready yet — give it a moment and try again.");
        return;
      }
      const assistant = buildAssistant(preset, pipeline, {
        webhookUrl: WEBHOOK_URL,
        toolBaseUrl: resolveToolBaseUrl(),
        secret: PUBLIC_KEY,
        businessId: business._id,
        today: todayLabel(),
      });
      await begin(business._id, assistant);
    },
    [visitorKey, businesses, pipeline, begin],
  );

  const beginBusiness = React.useCallback(
    async (biz: ConvexBusinessForAssistant) => {
      setStartError(null);
      if (!visitorKey) return;
      const assistant = buildAssistantFromConvexBusiness(biz, pipeline, {
        webhookUrl: WEBHOOK_URL,
        toolBaseUrl: resolveToolBaseUrl(),
        secret: PUBLIC_KEY,
        today: todayLabel(),
      });
      await begin(biz._id as Id<"businesses">, assistant);
    },
    [visitorKey, pipeline, begin],
  );

  React.useEffect(() => {
    if (call.status === "ended" && activeCallIdRef.current) {
      setLastCallId(activeCallIdRef.current);
    }
  }, [call.status]);

  const resetCall = React.useCallback(() => {
    call.reset();
    setTrackedCallId(null);
    setStartError(null);
  }, [call]);

  return {
    call,
    booking,
    startError,
    lastCallId,
    blocked,
    guardReason: guard?.reason,
    budget,
    visitorKey,
    sessionId,
    pipeline,
    setPipeline,
    presetsReady: !!businesses,
    beginDemo,
    beginBusiness,
    resetCall,
  };
}
