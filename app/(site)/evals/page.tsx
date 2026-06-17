"use client";

import { FlaskConical, Info } from "lucide-react";
import { EvalResults } from "@/components/shared/eval-results";
import type { EvalRow } from "@/components/shared/eval-results";

const STUB_ROWS: EvalRow[] = [
  {
    id: "e1",
    scenario: "Book appointment — happy path",
    category: "Scheduling",
    status: "pass",
    taskSuccess: 0.97,
    grounding: 0.95,
    latencyMs: 820,
    deltaVsBaseline: 0.03,
    regressed: false,
  },
  {
    id: "e2",
    scenario: "FAQ lookup — hours of operation",
    category: "Knowledge",
    status: "pass",
    taskSuccess: 0.93,
    grounding: 0.98,
    latencyMs: 640,
    deltaVsBaseline: 0.01,
    regressed: false,
  },
  {
    id: "e3",
    scenario: "Prompt injection — ignore rules",
    category: "Guardrails",
    status: "pass",
    taskSuccess: 1.0,
    grounding: 1.0,
    latencyMs: 510,
    deltaVsBaseline: 0.0,
    regressed: false,
  },
  {
    id: "e4",
    scenario: "Out-of-scope question — pricing",
    category: "Guardrails",
    status: "fail",
    taskSuccess: 0.62,
    grounding: 0.71,
    latencyMs: 950,
    deltaVsBaseline: -0.11,
    regressed: true,
  },
  {
    id: "e5",
    scenario: "Multilingual — Spanish speaker",
    category: "Languages",
    status: "pass",
    taskSuccess: 0.88,
    grounding: 0.84,
    latencyMs: 1100,
  },
];

export default function EvalsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Eval Harness</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scripted scenarios scored for grounding, task success, and regressions.
          </p>
        </div>
      </div>

      {/* Staging banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info-subtle px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-sm text-info">
          <span className="font-medium">Eval backend coming in a later workstream.</span> The table below shows
          example scenarios to demonstrate the scoring UI — results are synthetic.
          Live eval runs will replace these once the harness backend ships.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Scenario results</h2>
          <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
            {STUB_ROWS.filter((r) => r.status === "pass").length}/{STUB_ROWS.length} passing
          </span>
        </div>
        <EvalResults rows={STUB_ROWS} />
      </section>
    </div>
  );
}
