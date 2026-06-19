/**
 * Pure VAPI end-of-call-report normalizer (the WS0 "real-VAPI-report spike").
 *
 * Reduces VAPI's `end-of-call-report` webhook body to the engine-agnostic
 * `EngineEndOfCallReport` (convex/_contracts.ts), then maps that to the
 * `recordEndOfCall` mutation args. Field paths match the VAPI server SDK:
 *   - call id            → message.call.id (fallback message.callId)
 *   - total cost         → message.cost (fallback message.call.costBreakdown.total)
 *   - component cost     → message.call.costBreakdown {stt,llm,tts,vapi,transport}
 *                          (fallback: reduce message.costs[] by type)
 *   - duration           → (endedAt - startedAt) / 1000  (NO native duration field)
 *   - latency            → message.artifact.performanceMetrics (often absent)
 *   - analysis           → message.analysis {summary,structuredData,successEvaluation}
 *
 * PURE: no Date.now()/Math.random(), no IO. Date.parse(string) is deterministic.
 */
import type { EngineEndOfCallReport, EngineKind } from "../_contracts";
// Shared VAPI *server webhook* envelope readers — single owner is vapiWire.ts.
import { num, pick, str, unwrapMessage } from "./vapiWire";

const ENGINE: EngineKind = "vapi";

/** Reduce message.costs[] by type into a {stt,llm,tts,platform} breakdown. */
function costsBreakdown(msg: Record<string, unknown>): {
  stt: number;
  llm: number;
  tts: number;
  platform: number;
} {
  const out = { stt: 0, llm: 0, tts: 0, platform: 0 };
  const costs = msg.costs;
  if (!Array.isArray(costs)) return out;
  for (const raw of costs) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const cost = num(c.cost) ?? 0;
    switch (c.type) {
      case "transcriber": out.stt += cost; break;
      case "model": out.llm += cost; break;
      case "voice": out.tts += cost; break;
      case "transport":
      case "vapi":
      case "analysis":
      case "knowledge-base":
      case "voicemail-detection":
      default: out.platform += cost; break;
    }
  }
  return out;
}

function successFrom(x: unknown): boolean | undefined {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") {
    const s = x.toLowerCase();
    if (s === "true" || s === "pass" || s === "success") return true;
    if (s === "false" || s === "fail") return false;
  }
  return undefined;
}

/**
 * Normalize a VAPI end-of-call-report webhook body. Returns null when the body
 * is not an end-of-call report or carries no call id.
 */
export function normalizeVapiEndOfCallReport(
  body: unknown,
): EngineEndOfCallReport | null {
  const msg = unwrapMessage(body);
  if (str(msg.type) !== "end-of-call-report") return null;

  const engineCallId =
    str(pick(msg, "call", "id")) ?? str(msg.callId) ?? str(pick(msg, "call", "callId"));
  if (!engineCallId) return null;

  // Duration: derive from ISO startedAt/endedAt (no native duration field).
  const startedAt = str(msg.startedAt);
  const endedAt = str(msg.endedAt);
  let durationSec = 0;
  if (startedAt && endedAt) {
    const s = Date.parse(startedAt);
    const e = Date.parse(endedAt);
    if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
      durationSec = Math.round((e - s) / 1000);
    }
  }

  // Cost: prefer the message.call.costBreakdown rollup, else reduce costs[].
  const cb = pick(msg, "call", "costBreakdown") as
    | Record<string, unknown>
    | undefined;
  let breakdown: { stt: number; llm: number; tts: number; platform: number };
  if (cb) {
    const stt = num(cb.stt) ?? 0;
    const llm = num(cb.llm) ?? 0;
    const tts = num(cb.tts) ?? 0;
    const vapi = num(cb.vapi) ?? 0;
    const transport = num(cb.transport) ?? 0;
    const total = num(cb.total);
    const platform =
      vapi + transport > 0
        ? vapi + transport
        : total !== undefined
          ? Math.max(0, total - stt - llm - tts)
          : 0;
    breakdown = { stt, llm, tts, platform };
  } else {
    breakdown = costsBreakdown(msg);
  }

  const costUsd =
    num(msg.cost) ??
    num(pick(msg, "call", "costBreakdown", "total")) ??
    breakdown.stt + breakdown.llm + breakdown.tts + breakdown.platform;

  // Latency: message.artifact.performanceMetrics (often absent → undefined).
  const pm = pick(msg, "artifact", "performanceMetrics") as
    | Record<string, unknown>
    | undefined;
  const firstTurn = pick(pm, "turnLatencies", "0") as
    | Record<string, unknown>
    | undefined;
  const componentLatencyMs = {
    stt: num(pm?.transcriberLatencyAverage),
    llm: num(pm?.modelLatencyAverage),
    tts: num(pm?.voiceLatencyAverage),
    ttfw: num(firstTurn?.turnLatency) ?? num(pm?.turnLatencyAverage),
  };

  const summary = str(pick(msg, "analysis", "summary"));
  const structuredData = pick(msg, "analysis", "structuredData");
  const successEval = successFrom(pick(msg, "analysis", "successEvaluation"));

  return {
    engine: ENGINE,
    engineCallId,
    durationSec,
    costUsd,
    costBreakdown: breakdown,
    componentLatencyMs,
    summary,
    structuredData,
    successEval,
  };
}

/** Args of internal.calls.recordEndOfCall — kept structurally in lock-step. */
export interface RecordEndOfCallArgs {
  vapiCallId: string;
  durationSec: number;
  costUsd: number;
  costBreakdown: { stt: number; llm: number; tts: number; platform: number };
  summary?: string;
  structuredData?: unknown;
  successEval?: boolean;
  languages?: string[];
  ttfwMs?: number;
}

/** Map the engine-agnostic report to recordEndOfCall's args. */
export function engineReportToRecordArgs(
  report: EngineEndOfCallReport,
): RecordEndOfCallArgs {
  return {
    vapiCallId: report.engineCallId,
    durationSec: report.durationSec,
    costUsd: report.costUsd,
    costBreakdown: report.costBreakdown,
    summary: report.summary,
    structuredData: report.structuredData,
    successEval: report.successEval,
    // languages are not reliably present in the VAPI report; left undefined.
    languages: undefined,
    ttfwMs: report.componentLatencyMs.ttfw,
  };
}
