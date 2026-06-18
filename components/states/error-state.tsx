"use client";

import { Warning, ArrowClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * ErrorState — danger icon + plain-language cause + Retry (re-invokes the failed query)
 * + optional secondary. `inline` sits in a card; `full` takes the page. Backoff hint on
 * repeated failures.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. It's usually transient — try again.",
  onRetry,
  retries = 0,
  variant = "inline",
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retries?: number;
  variant?: "inline" | "full";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "full" ? "px-6 py-20" : "rounded-lg border border-danger/20 bg-danger-subtle/40 px-6 py-10",
        className,
      )}
    >
      <Warning className="size-6 text-danger" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {retries >= 2 && (
        <p className="mt-1 font-mono text-xs text-muted-foreground">Retrying with backoff…</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}>
          <ArrowClockwise className="size-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
