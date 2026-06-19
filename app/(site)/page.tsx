import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ChatCircle,
  FileText,
  Lock,
  Phone,
  ShieldCheck,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/shared/voice-visualizer";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero: copy + a live call card (real component, not a fake screenshot) ── */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-20 pb-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-24">
        <div>
          <h1 className="max-w-[15ch] text-balance text-4xl leading-[1.03] font-bold sm:text-5xl lg:text-6xl">
            The receptionist that never misses a call.
          </h1>
          <p className="mt-6 max-w-md text-pretty text-lg text-muted-foreground">
            It answers questions about your business, books appointments, and takes messages. Live in
            your browser, no signup.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/try">
                <Phone weight="fill" className="size-4" />
                Hear it answer
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>

        <CallCard />
      </section>

      {/* ── Trust band (three plain claims, vertical rules, no decorative dots) ── */}
      <section className="border-y bg-secondary/40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-border px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
          {[
            ["Answers in under a second", "No hold music, no phone tree."],
            ["Works around the clock", "Evenings, weekends, and every busy lunch rush."],
            ["Nothing to install", "It runs in the browser. Your callers just talk."],
          ].map(([h, b]) => (
            <div key={h} className="px-2 py-8 sm:px-8">
              <p className="font-medium">{h}</p>
              <p className="mt-1 text-sm text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works: three steps, verb headings, connected rail ── */}
      <section id="how-it-works" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-24 sm:px-6">
        <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Set it up in three steps.</h2>
        <div className="relative mt-14 grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          <div className="pointer-events-none absolute inset-x-[16%] top-5 hidden h-px bg-border md:block" />
          {[
            {
              icon: FileText,
              title: "Add your business",
              body: "Pick a sample business or paste your own details. It learns your hours, services, and prices.",
            },
            {
              icon: Phone,
              title: "Let it answer",
              body: "Callers just talk. It listens, answers from your information, and asks the right follow-up questions.",
            },
            {
              icon: CalendarCheck,
              title: "Get the booking",
              body: "You receive the appointment, a calendar invite, and a plain-English summary of every call.",
            },
          ].map((s) => (
            <div key={s.title} className="relative">
              <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
                <s.icon weight="regular" className="size-5 text-primary" />
              </div>
              <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-pretty text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What it does on every call: editorial 2-col list, not a card grid ── */}
      <section className="border-t bg-secondary/40">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-3xl font-bold text-balance sm:text-4xl">
              Everything a great receptionist does, on every call.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              It stays inside what you tell it, so it is helpful without ever overpromising.
            </p>
            <Link
              href="/leaderboard"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors hover:text-primary"
            >
              Curious how it stacks up? Take a look under the hood
              <ArrowRight weight="bold" className="size-3.5 text-primary" />
            </Link>
          </div>

          <dl className="divide-y divide-border">
            {[
              {
                icon: FileText,
                title: "Answers from your own information",
                body: "It only uses the details you give it, so it never invents hours, prices, or policies.",
              },
              {
                icon: CalendarCheck,
                title: "Books the appointment",
                body: "It checks what is open, schedules the caller, and sends a calendar invite automatically.",
              },
              {
                icon: ChatCircle,
                title: "Takes a message when it cannot help",
                body: "It captures who called and what they needed, so you can follow up at a good time.",
              },
              {
                icon: Wallet,
                title: "Stays on budget",
                body: "Clear spending caps you can watch, so a busy day never turns into a surprise bill.",
              },
              {
                icon: ShieldCheck,
                title: "Never goes off-script",
                body: "It politely declines anything outside your business and makes no promises you did not approve.",
              },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 py-6">
                <f.icon weight="regular" className="mt-0.5 size-6 shrink-0 text-primary" />
                <div>
                  <dt className="font-semibold">{f.title}</dt>
                  <dd className="mt-1 text-pretty text-muted-foreground">{f.body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="mx-auto w-full max-w-3xl px-4 py-28 text-center sm:px-6">
        <h2 className="text-balance text-3xl font-bold sm:text-4xl">Hear it answer a call.</h2>
        <p className="mx-auto mt-4 max-w-md text-pretty text-muted-foreground">
          Try a live demo in your browser. It takes about a minute, and you do not need an account.
        </p>
        <Button asChild size="lg" className="mt-8 gap-2">
          <Link href="/try">
            <Phone weight="fill" className="size-4" />
            Hear it answer
          </Link>
        </Button>
      </section>

      {/* ── Privacy band ── */}
      <section className="border-t">
        <div className="mx-auto flex w-full max-w-3xl items-start gap-3 px-4 py-12 text-sm text-muted-foreground sm:px-6">
          <Lock weight="regular" className="mt-0.5 size-5 shrink-0" />
          <p className="text-pretty">
            <span className="font-medium text-foreground">Private by default.</span> Every caller is
            told the call is recorded before it starts. Personal details are kept out of the logs, and
            recordings, transcripts, and any uploads are deleted after 24 hours.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Live call card: a real component preview, the synthetic conversation visualizer. */
function CallCard() {
  return (
    <div className="rounded-2xl bg-foreground p-6 text-background shadow-lg">
      <div className="flex items-center font-mono text-[11px] text-background/60">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_0_2px] shadow-primary/15" />
          On a call
        </span>
      </div>
      <div className="h-44">
        <VoiceVisualizer mode="demo" bars={5} className="h-full" />
      </div>
      <p className="text-center text-sm text-background/70">
        Answering a question, then booking the appointment.
      </p>
    </div>
  );
}
