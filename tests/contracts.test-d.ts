import { assertType, expectTypeOf, test } from "vitest";
import type { FunctionArgs } from "convex/server";
import { internal } from "../convex/_generated/api";

import type {
  TraceSpan as ContractTraceSpan,
  SpanKind as ContractSpanKind,
  GuardReason as ContractGuardReason,
  EngineEndOfCallReport,
} from "../convex/_contracts";
import type {
  TraceSpan as UiTraceSpan,
  SpanKind as UiSpanKind,
  GuardReason as UiGuardReason,
} from "../lib/types";
import {
  normalizeVapiEndOfCallReport,
  engineReportToRecordArgs,
  type RecordEndOfCallArgs,
} from "../convex/lib/vapiReport";

test("_contracts mirrors lib/types (no drift)", () => {
  // The frozen OTel span + enums must be identical on both sides of the seam.
  expectTypeOf<ContractTraceSpan>().toEqualTypeOf<UiTraceSpan>();
  expectTypeOf<ContractSpanKind>().toEqualTypeOf<UiSpanKind>();
  expectTypeOf<ContractGuardReason>().toEqualTypeOf<UiGuardReason>();
});

test("normalizer output IS an EngineEndOfCallReport", () => {
  const r = normalizeVapiEndOfCallReport({} as unknown);
  // Returns the report or null; the non-null branch must equal the contract.
  expectTypeOf(r).toEqualTypeOf<EngineEndOfCallReport | null>();
});

test("engineReportToRecordArgs is assignable to recordEndOfCall's real args", () => {
  type RealArgs = FunctionArgs<typeof internal.calls.recordEndOfCall>;
  const args: RecordEndOfCallArgs = engineReportToRecordArgs(
    {} as EngineEndOfCallReport,
  );
  // The mapper's output must satisfy the actual Convex mutation arg type.
  assertType<RealArgs>(args);
});

test("DRIFT SENTINEL — a wrong span kind must not be assignable", () => {
  // @ts-expect-error "network" is not a valid SpanKind; if this ever compiles,
  // the frozen SpanKind enum has drifted and CI must fail here.
  const bad: ContractSpanKind = "network";
  void bad;
});
