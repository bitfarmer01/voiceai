"use client";

import * as React from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TranscriptTurn } from "@/lib/types";

/**
 * CallTimeline — streaming speaker turns + system events. Interim text is greyed
 * then solidifies; auto-scrolls to live with a jump-to-live affordance when the user
 * scrolls up. Appears on Try It, Report (static), Evals drawer.
 */
export function CallTimeline({
  turns,
  className,
  autoScroll = true,
}: {
  turns: TranscriptTurn[];
  className?: string;
  autoScroll?: boolean;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  React.useEffect(() => {
    if (autoScroll && atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, autoScroll, atBottom]);

  return (
    <div className={cn("relative", className)}>
      <div ref={scrollRef} onScroll={onScroll} className="max-h-full space-y-3 overflow-y-auto pr-1">
        {turns.map((t) =>
          t.role === "system" ? (
            <div key={t.idx} className="flex justify-center">
              <span className="rounded-full border bg-muted px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {t.text}
              </span>
            </div>
          ) : (
            <div key={t.idx} className={cn("flex flex-col gap-1", t.role === "user" ? "items-start" : "items-end")}>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {t.role === "user" ? "Caller" : "Receptionist"}
              </span>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  t.role === "user" ? "bg-muted" : "bg-primary text-primary-foreground",
                  t.interim && "opacity-50",
                )}
              >
                {t.text}
              </div>
            </div>
          ),
        )}
      </div>

      {!atBottom && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 gap-1 shadow-md"
          onClick={() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }}
        >
          <ArrowDown className="size-3.5" /> Jump to live
        </Button>
      )}
    </div>
  );
}
