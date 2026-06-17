import Link from "next/link";

/** Slim compliance footer — copy locked by ui-development-plan.md §2. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-wider tabular-nums text-muted-foreground">
          Anonymous demo · No signup · Calls auto-purge after 24h · PII redacted
        </p>
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Built with Next.js · Convex · VAPI</span>
          <Link href="/calls" className="transition-colors hover:text-foreground">
            Recent Calls
          </Link>
        </div>
      </div>
    </footer>
  );
}
