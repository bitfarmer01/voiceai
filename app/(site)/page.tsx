import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  FileText,
  FlaskConical,
  Gauge,
  Lock,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Trophy,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveSignalChip } from "@/components/landing/live-signal-chip";
import { RecentCallsTicker } from "@/components/landing/recent-calls-ticker";
import { HeroProductPeek } from "@/components/landing/hero-product-peek";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 pt-16 text-center sm:px-6 lg:pt-24">
        <LiveSignalChip />
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Document-grounded · Web-only · No signup
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
          Talk to an AI receptionist that{" "}
          <span className="text-muted-foreground">actually knows the business.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Pick or upload a business document, then talk live in your browser. It answers FAQs
          from the doc, books appointments, and captures intent — with production observability,
          provider benchmarking, evals, and a hard budget guard all visible.
        </p>
        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <Link href="/try">
              <PhoneCall className="size-4" />
              Talk to a receptionist
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#how-it-works">See how it works</Link>
          </Button>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          No signup · 120-second demo call · Mic asked once
        </p>

        <HeroProductPeek className="mt-16" />
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-24 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <div className="relative mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-6 hidden h-px bg-border md:block" />
          {[
            { n: "01", icon: FileText, title: "Pick or upload a doc", body: "Choose a preset business or drop a PDF/DOCX. We extract a Business Profile + FAQ knowledge in seconds." },
            { n: "02", icon: MessageSquare, title: "Talk in the browser", body: "Grant the mic and speak live over WebRTC. The receptionist is grounded strictly in your document." },
            { n: "03", icon: CalendarCheck, title: "Get a booking + report", body: "Walk away with a structured booking (.ics), captured intent, and a full trace + cost report." },
          ].map((s) => (
            <div key={s.n} className="relative flex flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center rounded-lg border bg-card shadow-sm">
                <s.icon className="size-5 text-primary" />
              </div>
              <span className="mt-4 font-mono text-xs text-muted-foreground">{s.n}</span>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Built like production (bento) ────────────────────────────────── */}
      <section className="border-y bg-secondary/40">
        <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">Built like production.</h2>
            <p className="mt-3 text-lg text-muted-foreground">
              No black boxes. Live tracing, hot-swappable providers, eval-driven development, and a
              hard spend guard are surfaced as first-class UI — not buried.
            </p>
          </div>

          <div className="mt-12 grid auto-rows-[200px] grid-cols-1 gap-4 md:grid-cols-3">
            <FeatureCard
              href="/calls"
              icon={Activity}
              title="Live tracing"
              body="Per-turn STT → LLM → tool → TTS waterfall with time-to-first-word. Every millisecond accounted for."
              className="md:col-span-2"
            />
            <FeatureCard href="/leaderboard" icon={Trophy} title="Provider leaderboard" body="Latency × cost × rated quality across 6+ providers — plus a custom Fal.ai adapter." />
            <FeatureCard href="/evals" icon={FlaskConical} title="Eval harness" body="Scripted scenarios scored for grounding, task success, and regressions." />
            <FeatureCard
              href="/analytics"
              icon={Wallet}
              title="$40 budget guard"
              body="Hard global cap, $8/day, 2 calls/visitor, 3 concurrent, 120s/call — each with a graceful UI state."
              accent="warning"
            />
            <FeatureCard href="/try" icon={ShieldCheck} title="Guardrails" body="Prompt-injection defense, anti-hallucination, stay-in-role refusal — each fired event surfaced." />
          </div>
        </div>
      </section>

      {/* ── Recent calls ticker ──────────────────────────────────────────── */}
      <section className="border-b py-5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <RecentCallsTicker />
        </div>
      </section>

      {/* ── Privacy trust band ───────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Secure by default.</span> Recording consent
          shown before the first call. PII is redacted before logging. Uploaded docs, transcripts,
          and audio auto-purge after 24 hours.
        </p>
      </section>
    </div>
  );
}

function FeatureCard({
  href,
  icon: Icon,
  title,
  body,
  className,
  accent = "primary",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  className?: string;
  accent?: "primary" | "warning";
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card p-6 transition-colors hover:border-primary/40 ${className ?? ""}`}
    >
      <Icon className={accent === "warning" ? "size-5 text-warning" : "size-5 text-primary"} />
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        View <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}
