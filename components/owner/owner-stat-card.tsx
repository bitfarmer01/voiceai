import type { Icon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/format";

/**
 * OwnerStatCard — one plain-language headline number for the owner Overview.
 * Big tabular figure + a short label + an optional one-line explanation, with a
 * single muted Phosphor icon. No jargon, no accent glow — the number is the point.
 */
export function OwnerStatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: Icon;
  /** Short, owner-friendly label, e.g. "Calls answered". */
  label: string;
  /** The figure to show big (already a number). */
  value: number;
  /** Optional one-line plain-English explanation under the number. */
  hint?: string;
  /** Tints the icon with the single amber accent (use on the hero metric only). */
  accent?: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon
            className={accent ? "size-4 text-primary" : "size-4"}
            weight="duotone"
            aria-hidden
          />
          <span className="text-sm font-medium text-pretty">{label}</span>
        </div>
        <p className="font-heading text-3xl font-semibold tabular-nums leading-none">
          {formatCount(value)}
        </p>
        {hint && <p className="text-xs text-pretty text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
