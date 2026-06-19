"use client";

import * as React from "react";
import { timeAgo } from "@/lib/format";

/**
 * Hydration-safe relative time. `Date.now()` is read only after mount (in an
 * effect), so server and first client render agree on the placeholder ("") and
 * there's no mismatch / layout shift. Once mounted, derives the label via the
 * shared pure `timeAgo`. No periodic refresh — updates on the next render.
 */
export function useTimeAgo(fromMs: number): string {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    // Defer the first now-read to the next frame so setState isn't called
    // synchronously inside the effect (stays hydration-safe; avoids the
    // cascading-render lint rule).
    const id = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(id);
  }, []);
  if (now === null) return "";
  return timeAgo(fromMs, now);
}
