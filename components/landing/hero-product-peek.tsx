import { CheckCircle2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Static, on-brand preview of the 3-column mission control (left metrics · centre
 * agent orb · right trace waterfall). Reconciled from the Stitch hero peek into the
 * blue design system. Pure CSS motion (reduced-motion guarded globally).
 */
export function HeroProductPeek({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full max-w-6xl", className)}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background to-transparent" />
      <div className="overflow-hidden rounded-xl border bg-card shadow-2xl">
        {/* faux titlebar */}
        <div className="flex h-10 items-center gap-2 border-b bg-secondary/40 px-4">
          <span className="size-3 rounded-full bg-danger/30" />
          <span className="size-3 rounded-full bg-warning/30" />
          <span className="size-3 rounded-full bg-success/30" />
          <span className="flex-1 text-center font-mono text-[11px] text-muted-foreground">
            receptionist · mission-control
          </span>
        </div>

        <div className="grid h-[460px] grid-cols-1 divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {/* Col 1 — metrics */}
          <div className="flex flex-col gap-6 p-6 text-left">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              System metrics
            </p>
            <Metric label="p50 latency" value="420ms" valueClass="text-latency-good" pct={42} barClass="bg-latency-good" />
            <Metric label="Daily budget" value="$12.40 / $40" pct={31} barClass="bg-primary" />
            <div className="mt-auto">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Last evaluation
              </p>
              <div className="flex items-start gap-2 rounded-md border border-success/20 bg-success-subtle p-3">
                <CheckCircle2 className="mt-0.5 size-4 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">Booking intent extracted</p>
                  <p className="mt-0.5 font-mono text-xs text-success/70">confidence 0.98</p>
                </div>
              </div>
            </div>
          </div>

          {/* Col 2 — agent orb */}
          <div className="relative flex flex-col items-center justify-center gap-8 bg-secondary/20 p-6">
            <p className="absolute left-6 top-6 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Live agent
            </p>
            <span className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded border border-info/20 bg-info-subtle px-2 py-0.5 font-mono text-[10px] text-info">
              <Radio className="size-3" /> CONNECTED
            </span>

            <div className="relative flex size-32 animate-orb items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
              <div className="flex h-8 items-end gap-1">
                {[0.5, 0.8, 1, 0.7, 0.45].map((d, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-white/85"
                    style={{ height: "100%", animation: `eq-bar ${0.8 + i * 0.12}s ease-in-out infinite alternate`, transformOrigin: "bottom" }}
                  />
                ))}
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Processing inquiry…</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">req_938f2a · 1.2s elapsed</p>
            </div>
          </div>

          {/* Col 3 — trace waterfall */}
          <div className="flex flex-col gap-4 p-6 text-left">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Trace waterfall
            </p>
            <div className="relative space-y-4">
              <div className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
              <TraceRow color="bg-latency-good" title="User audio received" meta="VAD trigger · 0ms" />
              <TraceRow color="bg-primary" title="Deepgram STT" meta="“book an appointment” · 120ms" dim />
              <TraceRow color="bg-latency-slow" title="LLM inference (GPT-4o mini)" meta="check_availability(...) · 450ms" dim />
              <TraceRow color="bg-border" title="Cartesia TTS" meta="pending stream…" dim />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass,
  pct,
  barClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
  pct: number;
  barClass: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={valueClass ?? "text-foreground"}>{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full border bg-secondary">
        <div className={cn("h-full", barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TraceRow({ color, title, meta, dim }: { color: string; title: string; meta: string; dim?: boolean }) {
  return (
    <div className={cn("relative flex gap-3", dim && "opacity-60")}>
      <span className={cn("mt-1 size-2 shrink-0 rounded-full ring-4 ring-card", color)} />
      <div className="font-mono text-[11px]">
        <p className="text-foreground">{title}</p>
        <p className="mt-0.5 text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}
