"use client";

import * as React from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { UploadState } from "./doc-uploader";

interface IngestFormProps {
  /** The shared ingest state machine; `analyzing` drives the loading affordance. */
  state: UploadState;
  /** External disable (e.g. a call is in progress). OR'd with the loading state. */
  disabled?: boolean;
  /** Submit-button copy for the idle / in-flight states. */
  idleLabel: string;
  loadingLabel: string;
  onSubmit: () => void;
  /**
   * Source-specific field(s). A render prop receives the derived `isDisabled`
   * (`disabled || analyzing`) so each input disables itself consistently.
   */
  children: (args: { isDisabled: boolean }) => React.ReactNode;
}

/**
 * Shared scaffolding for the URL / paste / form ingest inputs. Owns the
 * `state → {isLoading, isDisabled}` derivation, the `<form>` wrapper, the
 * error `<p role="alert">`, and the spinner submit button. Source-specific
 * fields go in via `children`. The doc-uploader stays a standalone outlier
 * (drag/drop, progress, ready-filename).
 */
export function IngestForm({
  state,
  disabled,
  idleLabel,
  loadingLabel,
  onSubmit,
  children,
}: IngestFormProps) {
  const isLoading = state.status === "analyzing";
  const isDisabled = disabled || isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {children({ isDisabled })}

      {state.status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isDisabled}>
        {isLoading ? (
          <>
            <CircleNotch className="size-4 animate-spin" />
            {loadingLabel}
          </>
        ) : (
          idleLabel
        )}
      </Button>
    </form>
  );
}
