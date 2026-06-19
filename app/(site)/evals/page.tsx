"use client";

import { Flask } from "@phosphor-icons/react";
import { BuilderViewBanner } from "@/components/shared/builder-view-banner";
import { EmptyState } from "@/components/states/empty-state";

export default function EvalsPage() {
  // The eval harness has no live Convex query yet, so there is genuinely no run
  // data to show. We render an honest empty state rather than illustrative rows —
  // every number on this surface must come from a real run.
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <BuilderViewBanner />

      <div className="mb-8 flex items-start gap-3">
        <Flask className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-balance">Eval Harness</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Scripted scenarios scored for grounding, task success, and regressions.
          </p>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        <EmptyState
          icon={Flask}
          title="Eval harness isn't wired up yet"
          description="This build doesn't run the scripted eval scenarios yet. Once it does, their grounding and task-success scores — and any regressions between config changes — will show here."
          action={{ label: "Try it", href: "/try" }}
        />
      </section>
    </div>
  );
}
