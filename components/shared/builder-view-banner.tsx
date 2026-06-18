import { Wrench } from "@phosphor-icons/react/dist/ssr";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

/**
 * BuilderViewBanner — calm framing for the three engineering screens
 * (leaderboard / evals / analytics). These are only reachable via the
 * "Behind the scenes" toggle, so we say up front that this is the
 * technical detail behind the receptionist — not the owner's daily view.
 * One amber accent (the Phosphor icon), no glow, no gradient.
 */
export function BuilderViewBanner() {
  return (
    <Alert variant="default" className="mb-6">
      <Wrench className="text-primary" />
      <AlertTitle>Behind the scenes</AlertTitle>
      <AlertDescription>
        The engineering detail behind the receptionist. Numbers here are measured
        from real calls — they fill in as calls come through.
      </AlertDescription>
    </Alert>
  );
}
