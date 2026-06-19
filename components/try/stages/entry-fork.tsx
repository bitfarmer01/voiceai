"use client";

import { PlayCircle, Storefront, ArrowRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * EntryFork — the first stage of the guided /try journey. Two clear choices:
 * hear the one-tap demo, or build a receptionist for your own business. No
 * provider chrome, no jargon — just the two doors into the rest of the flow.
 */
export function EntryFork({
  onHearDemo,
  onBuild,
}: {
  onHearDemo: () => void;
  onBuild: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        Your AI receptionist
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Hear it answer the phone
      </h1>
      <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
        Listen to a real call in about two minutes, then point it at your own business and
        hear it answer as you. Where would you like to start?
      </p>

      <div className="mt-9 grid w-full gap-4 sm:grid-cols-2">
        <ChoiceCard
          accent
          icon={<PlayCircle weight="fill" className="size-7" />}
          title="Hear a quick demo"
          subtitle="A sample call with a dental clinic. About 2 minutes — we ask for your mic once."
          onClick={onHearDemo}
        />
        <ChoiceCard
          icon={<Storefront className="size-7" />}
          title="Build my receptionist"
          subtitle="Tell us a few things about your business and hear it answer for you."
          onClick={onBuild}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  subtitle,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex h-full flex-col items-start gap-3 rounded-2xl border bg-card p-6 text-left transition-colors",
        accent
          ? "border-primary/50 hover:border-primary"
          : "hover:border-foreground/30 hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-xl",
          accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="text-lg font-semibold tracking-tight">{title}</span>
      <span className="text-pretty text-sm text-muted-foreground">{subtitle}</span>
      <span
        className={cn(
          "mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {accent ? "Play the demo" : "Set it up"}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
