import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProviderKind, ProviderSource } from "@/lib/types";

const KIND_LABEL: Record<ProviderKind, string> = { stt: "STT", llm: "LLM", tts: "TTS" };

/**
 * ProviderChip — shared across PipelineSelector, LeaderboardTable, CostBreakdown,
 * ReportHeader. Brand colour appears only as a 2px left dot; custom (Fal.ai) adapters
 * get an accent ring + sparkle so they read as "not the built-in list".
 */
export function ProviderChip({
  name,
  kind,
  source = "native",
  showKind = false,
  selected = false,
  className,
}: {
  name: string;
  kind?: ProviderKind;
  source?: ProviderSource;
  showKind?: boolean;
  selected?: boolean;
  className?: string;
}) {
  const custom = source === "custom";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs",
        custom && "border-primary/40 ring-1 ring-primary/20",
        selected && "border-primary bg-accent",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", custom ? "bg-primary" : "bg-muted-foreground")} aria-hidden />
      <span className="font-medium text-foreground">{name}</span>
      {showKind && kind && (
        <span className="font-mono text-[10px] uppercase text-muted-foreground">{KIND_LABEL[kind]}</span>
      )}
      {custom && <Sparkles className="size-3 text-primary" />}
    </span>
  );
}

export function SourcePill({ source, className }: { source: ProviderSource; className?: string }) {
  const custom = source === "custom";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        custom ? "border-primary/30 bg-accent text-primary" : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {custom && <Sparkles className="size-2.5" />}
      {custom ? "Custom" : "Native"}
    </span>
  );
}
