import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a surface as showing small, illustrative demo fixtures rather than
 * measured usage. Used on screens that render the seeded demo data
 * (leaderboard, analytics, recent calls) until real calls populate Convex.
 */
export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("font-mono text-muted-foreground", className)}
      title="Illustrative sample — not measured usage"
    >
      Demo data
    </Badge>
  );
}
