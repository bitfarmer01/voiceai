"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProviders } from "@/lib/data";
import type { PipelineSelection } from "@/lib/vapi/assistant";
import type { ProviderKind } from "@/lib/types";

function Row({
  kind,
  label,
  value,
  onChange,
  disabled,
}: {
  kind: ProviderKind;
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const providers = useProviders(kind);
  return (
    <div className="space-y-1.5">
      <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                {p.source === "custom" && <Sparkles className="size-3 text-primary" />}
                {p.name}
                <span className="font-mono text-[10px] text-muted-foreground">{formatUsd(p.costPerMin, 3)}/min</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * PipelineSelector — independent STT / TTS / LLM selection. Shared with Evals.
 * Swapping while live restarts the call (VAPI can't change providers mid-call).
 */
export function PipelineSelector({
  value,
  onChange,
  liveCall = false,
  className,
}: {
  value: PipelineSelection;
  onChange: (next: PipelineSelection) => void;
  liveCall?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <Row kind="stt" label="Speech-to-text" value={value.sttId} onChange={(id) => onChange({ ...value, sttId: id })} />
      <Row kind="tts" label="Text-to-speech" value={value.ttsId} onChange={(id) => onChange({ ...value, ttsId: id })} />
      <Row kind="llm" label="Language model" value={value.llmId} onChange={(id) => onChange({ ...value, llmId: id })} />
      {liveCall && (
        <p className="text-[11px] text-muted-foreground">Changing the pipeline restarts the call.</p>
      )}
    </div>
  );
}
