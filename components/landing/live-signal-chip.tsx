"use client";

import { useActiveCallCount, useCallsToday } from "@/lib/data";

/** Pulsing live-calls chip in the hero. Reactive in production; mock-backed today. */
export function LiveSignalChip() {
  const active = useActiveCallCount();
  const today = useCallsToday();
  const idle = active === 0;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success-subtle px-3 py-1">
      <span className="relative flex size-2 items-center justify-center">
        {!idle && (
          <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success opacity-75" />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-success" />
      </span>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-success">
        {idle ? "Idle — be the first today" : `${active} ${active === 1 ? "call" : "calls"} live now · ${today} today`}
      </span>
    </div>
  );
}
