"use client";

import * as React from "react";
import { useAction } from "convex/react";
import { Sparkle, Plus, X, ArrowRight, CaretDown, CircleNotch } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConvexBusinessForAssistant } from "@/lib/vapi/assistant";
import { OtherWays } from "@/components/try/stages/other-ways";

type DraftProfile = {
  companyName: string;
  hours: string;
  services: string[];
  policies: string[];
  availability: string;
  chunks: { text: string; tags: string[] }[];
};

const MAX_SERVICES = 5;
const IDLE_MS = 5000;

/** Strip the internal "ingest_failed: " prefix from a backend error for display. */
function humanize(msg: string): string {
  return msg.replace(/^ingest_failed:\s*/i, "").trim() || "Something went wrong — try again.";
}

/**
 * Fire `cb(value)` once `value` has been stable for `delayMs` (no keystrokes).
 * Any change resets the timer; empty values never fire. Standard idle-debounce —
 * used to keep the live LLM suggestions from firing mid-thought.
 */
function useIdleCallback(value: string, delayMs: number, cb: (v: string) => void) {
  const cbRef = React.useRef(cb);
  React.useEffect(() => {
    cbRef.current = cb;
  });
  React.useEffect(() => {
    if (!value.trim()) return;
    const id = setTimeout(() => cbRef.current(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
}

/**
 * GuidedForm — the centerpiece of the journey. The owner supplies only what the
 * receptionist can't infer (name, business type, services), the NVIDIA LLM drafts
 * the rest (hours, policies, FAQ), and the owner reviews/edits before anything is
 * stored. Two assists: a "Draft my receptionist" button, and per-field live
 * suggestions that fire only after 5s of no typing (ghost-text for the type field,
 * tap-to-add chips for services). Calls `onReady` with the built business (/try path),
 * or `onSaveConfig` with the assembled profile (setup path).
 */
export function GuidedForm({
  sessionId,
  onReady,
  onSaveConfig,
  submitLabel,
  submittingLabel,
  showOtherWays = true,
}: {
  sessionId: string;
  onReady?: (biz: ConvexBusinessForAssistant) => void;
  onSaveConfig?: (profile: {
    companyName: string;
    hours: string;
    services: string[];
    policies: string[];
    availability: string;
    chunks: { text: string; tags: string[] }[];
  }) => Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  showOtherWays?: boolean;
}) {
  const [phase, setPhase] = React.useState<"seed" | "drafting" | "review">("seed");
  const [companyName, setCompanyName] = React.useState("");
  const [businessType, setBusinessType] = React.useState("");
  const [services, setServices] = React.useState<string[]>([]);
  const [serviceInput, setServiceInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [showOther, setShowOther] = React.useState(false);

  // live suggestions
  const [typeGhost, setTypeGhost] = React.useState("");
  const [serviceSuggestions, setServiceSuggestions] = React.useState<string[]>([]);

  // review (editable) state
  const [draft, setDraft] = React.useState<DraftProfile | null>(null);
  const [editServices, setEditServices] = React.useState<string[]>([]);
  const [editHours, setEditHours] = React.useState("");
  const [editBooking, setEditBooking] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const suggestFieldA = useAction(api.sources.suggestField);
  const generateDraftA = useAction(api.sources.generateDraftProfile);
  const createBizA = useAction(api.sources.createBusinessFromProfile);

  const ghostReq = React.useRef(0);
  const svcReq = React.useRef(0);

  useIdleCallback(businessType, IDLE_MS, async (v) => {
    if (phase !== "seed") return;
    const my = ++ghostReq.current;
    try {
      const r = await suggestFieldA({
        field: "businessType",
        companyName: companyName.trim() || undefined,
        partial: v,
      });
      if (my !== ghostReq.current) return;
      const s = (r.suggestion ?? "").trim();
      if (s && s.toLowerCase().startsWith(v.trim().toLowerCase()) && s.length > v.trim().length) {
        setTypeGhost(s);
      }
    } catch {
      /* suggestions are best-effort */
    }
  });

  const serviceKey = `${companyName}::${businessType}::${services.join("|")}`;
  useIdleCallback(serviceKey, IDLE_MS, async () => {
    if (phase !== "seed" || !companyName.trim() || !businessType.trim()) return;
    if (services.length >= MAX_SERVICES) return setServiceSuggestions([]);
    const my = ++svcReq.current;
    try {
      const r = await suggestFieldA({
        field: "services",
        companyName: companyName.trim(),
        businessType: businessType.trim(),
        existing: services,
      });
      if (my !== svcReq.current) return;
      const list = (r.suggestions ?? []).filter(
        (s) => !services.some((x) => x.toLowerCase() === s.toLowerCase()),
      );
      setServiceSuggestions(list.slice(0, 6));
    } catch {
      /* best-effort */
    }
  });

  const addService = (raw: string) => {
    const s = raw.trim();
    if (!s || services.length >= MAX_SERVICES) return;
    if (services.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    setServices((prev) => [...prev, s]);
    setServiceInput("");
    setServiceSuggestions((prev) => prev.filter((x) => x.toLowerCase() !== s.toLowerCase()));
  };

  const doDraft = async () => {
    if (phase === "drafting") return;
    // Validate at the action (not by disabling the button) so the next step is
    // always clear and a missing field gets a friendly hint right here.
    if (companyName.trim().length < 2) {
      setError("Add your business name to continue.");
      return;
    }
    if (!businessType.trim()) {
      setError("Add what kind of business it is — we use it to draft the rest.");
      return;
    }
    setError(null);
    setPhase("drafting");
    try {
      const d = (await generateDraftA({
        companyName: companyName.trim(),
        businessType: businessType.trim(),
        services,
      })) as DraftProfile;
      setDraft(d);
      setEditServices(d.services.length ? d.services : services);
      setEditHours(d.hours);
      setEditBooking(d.availability);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? humanize(e.message) : "Couldn't draft your receptionist — try again.");
      setPhase("seed");
    }
  };

  const confirm = async () => {
    if (!draft) return;
    setError(null);
    setSubmitting(true);
    const name = companyName.trim() || draft.companyName;
    const profile = {
      companyName: name,
      hours: editHours.trim(),
      services: editServices,
      policies: draft.policies,
      availability: editBooking.trim(),
      chunks: draft.chunks,
    };

    // Setup path: persist via the injected saver (e.g. upsertConfigured). The parent
    // advances on success and this component unmounts.
    if (onSaveConfig) {
      try {
        await onSaveConfig(profile);
      } catch {
        setError("Couldn't save your configuration — please try again.");
        setSubmitting(false);
      }
      return;
    }

    // Default /try path: create the business, then start the call.
    try {
      const { businessId } = await createBizA({ sessionId, ...profile });
      onReady?.({
        _id: businessId,
        name,
        profile: {
          companyName: name,
          hours: profile.hours,
          services: profile.services,
          policies: profile.policies,
          availability: profile.availability,
        },
        chunks: profile.chunks.map((c) => ({ text: c.text })),
      });
      // onReady advances the journey to the call stage; this component unmounts.
    } catch {
      setError("Couldn't save your business — please try again.");
      setSubmitting(false);
    }
  };

  const typeSuffix = typeGhost ? typeGhost.slice(businessType.length) : "";

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      {phase !== "review" ? (
        <>
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            Build my receptionist
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
            Tell us about your business
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Just a few things — your receptionist drafts the rest, and you can fix anything that&apos;s off.
          </p>

          <div className="mt-7 space-y-5">
            <Field label="Business name">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Lakeside Dental"
                autoFocus
              />
            </Field>

            <Field label="What kind of business?" hint="we use this to suggest the rest">
              <div className="relative">
                {typeSuffix && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center whitespace-pre px-3 text-sm"
                  >
                    <span className="invisible">{businessType}</span>
                    <span className="text-muted-foreground/50">{typeSuffix}</span>
                  </div>
                )}
                <Input
                  value={businessType}
                  onChange={(e) => {
                    setBusinessType(e.target.value);
                    setTypeGhost(""); // idle callback re-populates after 5s
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && typeGhost) {
                      e.preventDefault();
                      setBusinessType(typeGhost);
                      setTypeGhost("");
                    }
                  }}
                  placeholder="e.g. Dental clinic"
                  className="relative bg-transparent"
                />
              </div>
              {typeSuffix && (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Press Tab to use “{typeGhost}”
                </p>
              )}
            </Field>

            <Field
              label="Services you offer"
              hint={`up to ${MAX_SERVICES}${services.length ? ` · ${services.length} added` : ""}`}
            >
              {services.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {services.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-sm"
                    >
                      {s}
                      <button
                        onClick={() => setServices((prev) => prev.filter((x) => x !== s))}
                        aria-label={`Remove ${s}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                value={serviceInput}
                onChange={(e) => setServiceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addService(serviceInput);
                  }
                }}
                placeholder={services.length >= MAX_SERVICES ? "That's plenty — 5 max" : "Type a service, press Enter"}
                disabled={services.length >= MAX_SERVICES}
              />
              {serviceSuggestions.length > 0 && services.length < MAX_SERVICES && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] text-muted-foreground">Suggestions:</span>
                  {serviceSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => addService(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/60 px-2.5 py-0.5 text-sm text-primary hover:bg-primary/5"
                    >
                      <Plus className="size-3" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          <Button className="mt-6 w-full gap-1.5" disabled={phase === "drafting"} onClick={doDraft}>
            {phase === "drafting" ? (
              <>
                <CircleNotch className="size-4 animate-spin" />
                Drafting your receptionist…
              </>
            ) : (
              <>
                <Sparkle weight="fill" className="size-4" />
                Draft my receptionist
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            We&apos;ll fill in hours, booking, and common questions — you review it next.
          </p>

          {showOtherWays && (
            <div className="mt-6 border-t pt-4">
              <button
                onClick={() => setShowOther((s) => !s)}
                className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={showOther}
              >
                Rather paste your info or upload a file?
                <CaretDown className={cn("size-4 transition-transform", showOther && "rotate-180")} />
              </button>
              {showOther && (
                <div className="mt-3">
                  <OtherWays sessionId={sessionId} onReady={onReady ?? (() => {})} disabled={phase === "drafting"} />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="font-mono text-xs uppercase tracking-wide text-primary">
            <Sparkle weight="fill" className="mr-1 inline size-3" />
            Drafted from your answers — please check it
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
            Here&apos;s {companyName.trim() || "your receptionist"}
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Tap to edit anything. When it looks right, call your receptionist and hear it answer.
          </p>

          <div className="mt-7 space-y-5">
            <Field label="Services">
              <div className="flex flex-wrap gap-1.5">
                {editServices.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-sm"
                  >
                    {s}
                    <button
                      onClick={() => setEditServices((prev) => prev.filter((x) => x !== s))}
                      aria-label={`Remove ${s}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <AddChip onAdd={(v) => setEditServices((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]))} />
              </div>
            </Field>

            <Field label="Hours">
              <Input value={editHours} onChange={(e) => setEditHours(e.target.value)} placeholder="Mon–Fri 9–5" />
            </Field>

            <Field label="How you book">
              <Input
                value={editBooking}
                onChange={(e) => setEditBooking(e.target.value)}
                placeholder="By phone — offer the next open slot"
              />
            </Field>
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          <Button className="mt-6 w-full gap-1.5" onClick={confirm} disabled={submitting || !editHours.trim()}>
            {submitting ? (
              <>
                <CircleNotch className="size-4 animate-spin" />
                {submittingLabel ?? "Setting up…"}
              </>
            ) : (
              <>
                {submitLabel ?? "Sounds right — call my receptionist"}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          <button
            onClick={() => {
              setPhase("seed");
              setDraft(null);
              setError(null);
            }}
            className="mt-3 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Start over
          </button>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** Inline "+ add" chip with a tiny input, for adding a service in the review step. */
function AddChip({ onAdd }: { onAdd: (v: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/60 px-2.5 py-0.5 text-sm text-primary hover:bg-primary/5"
      >
        <Plus className="size-3" />
        add
      </button>
    );
  }
  const commit = () => {
    if (val.trim()) onAdd(val.trim());
    setVal("");
    setOpen(false);
  };
  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setVal("");
          setOpen(false);
        }
      }}
      placeholder="service"
      className="w-28 rounded-full border bg-card px-2.5 py-0.5 text-sm outline-none focus:border-primary"
    />
  );
}
