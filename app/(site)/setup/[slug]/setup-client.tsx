"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { GuidedForm } from "@/components/try/stages/guided-form";
import { AvailabilityCalendar } from "@/components/shared/availability-calendar";
import type { ServiceIntake } from "@/lib/types";

/**
 * SetupClient — the operator's configuration surface for /setup/[slug]. Reuses the
 * guided form (seed → AI draft → review), but its terminal action saves the business
 * permanently under this slug (kind: "configured") instead of starting a call. On
 * success it shows the shareable /app/[slug] link. The form always starts blank — a
 * fresh save silently overwrites any existing config at this slug.
 */
export function SetupClient({ slug }: { slug: string }) {
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const upsert = useMutation(api.businesses.upsertConfigured);
  const existing = useQuery(api.businesses.getBySlug, { slug });

  const handleSave = React.useCallback(
    async (profile: {
      companyName: string;
      hours: string;
      services: string[];
      policies: string[];
      availability: string;
      chunks: { text: string; tags: string[] }[];
      intakeQuestions?: ServiceIntake[];
    }) => {
      const id = await upsert({
        slug,
        name: profile.companyName,
        profile: {
          companyName: profile.companyName,
          hours: profile.hours,
          services: profile.services,
          policies: profile.policies,
          availability: profile.availability,
          intakeQuestions: profile.intakeQuestions,
        },
        chunks: profile.chunks,
      });
      setSavedId(id);
    },
    [slug, upsert],
  );

  if (savedId) return <SavedConfirmation slug={slug} businessId={savedId} />;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {existing && (
        <div className="px-4 pt-8">
          <AvailabilityCalendar businessId={existing._id} ownerView title="Your calendar" />
        </div>
      )}
      <GuidedForm
        sessionId={sessionId}
        onSaveConfig={handleSave}
        submitLabel="Save configuration"
        submittingLabel="Saving…"
        showOtherWays={false}
      />
    </div>
  );
}

function SavedConfirmation({ slug, businessId }: { slug: string; businessId: string }) {
  const [copied, setCopied] = React.useState(false);
  const canonical = slug.trim().toLowerCase();
  const path = `/app/${canonical}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard may be blocked; the path is shown in full for manual copy.
    }
  };

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border bg-muted">
        <Check weight="bold" className="size-8 text-success" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance">
        Your receptionist is live
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        Share this link with your client — it opens an instant demo call.
      </p>

      <div className="mt-6 flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <code className="flex-1 truncate text-left font-mono text-sm">{path}</code>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>

      <Button asChild variant="ghost" className="mt-4">
        <a href={path}>Open the demo</a>
      </Button>

      <AvailabilityCalendar businessId={businessId} ownerView title="Your calendar" className="mt-8 w-full text-left" />
    </div>
  );
}
