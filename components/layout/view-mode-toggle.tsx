"use client";

import { Wrench } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/lib/view-mode";

/**
 * Two-state control that reveals the technical ("behind the scenes") screens.
 * OFF = owner view (plain language only). ON = technical view (extra nav + detail).
 * Same visual family as ThemeToggle: ghost icon button, muted by default, the
 * amber accent appears only when on.
 */
export function ViewModeToggle() {
  const { mode, toggle } = useViewMode();
  const on = mode === "technical";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={on}
      aria-label="Behind the scenes"
      title="Behind the scenes"
      className={cn(
        "size-8 transition-colors",
        on ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Wrench weight={on ? "fill" : "regular"} className="size-4" />
      <span className="sr-only">Behind the scenes</span>
    </Button>
  );
}
