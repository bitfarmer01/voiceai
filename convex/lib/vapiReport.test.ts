import { describe, expect, test } from "vitest";
import {
  normalizeVapiEndOfCallReport,
  engineReportToRecordArgs,
} from "./vapiReport";
import {
  VAPI_END_OF_CALL_REPORT,
  VAPI_END_OF_CALL_REPORT_MINIMAL,
  VAPI_STATUS_UPDATE,
} from "./__fixtures__/vapiEndOfCallReport";

describe("normalizeVapiEndOfCallReport", () => {
  test("extracts the full report from the real shape", () => {
    const r = normalizeVapiEndOfCallReport(VAPI_END_OF_CALL_REPORT);
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.engine).toBe("vapi");
    expect(r.engineCallId).toBe("vapi_call_abc123");

    // Duration derived from startedAt/endedAt (204s), NOT a missing duration field.
    expect(r.durationSec).toBe(204);

    expect(r.costUsd).toBeCloseTo(0.182, 5);

    // costBreakdown comes from message.call.costBreakdown; platform = vapi + transport.
    expect(r.costBreakdown.stt).toBeCloseTo(0.0146, 5);
    expect(r.costBreakdown.llm).toBeCloseTo(0.0931, 5);
    expect(r.costBreakdown.tts).toBeCloseTo(0.0432, 5);
    expect(r.costBreakdown.platform).toBeCloseTo(0.017 + 0.0204, 5);

    // Latency from message.artifact.performanceMetrics.
    expect(r.componentLatencyMs.stt).toBe(180);
    expect(r.componentLatencyMs.llm).toBe(540);
    expect(r.componentLatencyMs.tts).toBe(210);
    expect(r.componentLatencyMs.ttfw).toBe(1150); // first turnLatencies[].turnLatency

    expect(r.summary).toBe("Customer asked about pricing and booked a cleaning.");
    expect(r.structuredData).toEqual({ intent: "booking", booked: true });
    expect(r.successEval).toBe(true);
  });

  test("handles a minimal report: no performanceMetrics, no call.costBreakdown", () => {
    const r = normalizeVapiEndOfCallReport(VAPI_END_OF_CALL_REPORT_MINIMAL);
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.engineCallId).toBe("vapi_call_minimal");
    expect(r.durationSec).toBe(48);
    // costBreakdown reconstructed from costs[].
    expect(r.costBreakdown.stt).toBeCloseTo(0.01, 5);
    expect(r.costBreakdown.llm).toBeCloseTo(0.02, 5);
    expect(r.costBreakdown.tts).toBeCloseTo(0.015, 5);
    expect(r.costBreakdown.platform).toBeCloseTo(0.005, 5);
    // No latency reported.
    expect(r.componentLatencyMs.stt).toBeUndefined();
    expect(r.componentLatencyMs.llm).toBeUndefined();
    expect(r.componentLatencyMs.tts).toBeUndefined();
    expect(r.componentLatencyMs.ttfw).toBeUndefined();
    expect(r.successEval).toBe(false);
    expect(r.summary).toBeUndefined();
  });

  test("returns null for a non-report message", () => {
    expect(normalizeVapiEndOfCallReport(VAPI_STATUS_UPDATE)).toBeNull();
  });

  test("returns null when there is no call id", () => {
    expect(
      normalizeVapiEndOfCallReport({ message: { type: "end-of-call-report" } }),
    ).toBeNull();
  });
});

describe("engineReportToRecordArgs", () => {
  test("maps the engine report to recordEndOfCall args", () => {
    const report = normalizeVapiEndOfCallReport(VAPI_END_OF_CALL_REPORT)!;
    const args = engineReportToRecordArgs(report);

    expect(args.vapiCallId).toBe("vapi_call_abc123");
    expect(args.durationSec).toBe(204);
    expect(args.costUsd).toBeCloseTo(0.182, 5);
    expect(args.costBreakdown).toEqual(report.costBreakdown);
    expect(args.ttfwMs).toBe(1150); // from componentLatencyMs.ttfw
    expect(args.summary).toBe(report.summary);
    expect(args.successEval).toBe(true);
    expect(args.languages).toBeUndefined();
  });
});
