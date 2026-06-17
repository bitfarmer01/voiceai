"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = React.useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="rounded p-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              "size-5 transition-colors",
              (hover || value) >= n
                ? "fill-warning text-warning"
                : "fill-none text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}
