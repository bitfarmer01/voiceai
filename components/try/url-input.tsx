"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { IngestForm } from "./ingest-form";
import type { UploadState } from "./doc-uploader";

interface UrlInputProps {
  onSubmit: (url: string) => Promise<void>;
  state: UploadState;
  disabled?: boolean;
}

export function UrlInput({ onSubmit, state, disabled }: UrlInputProps) {
  const [url, setUrl] = React.useState("");

  return (
    <IngestForm
      state={state}
      disabled={disabled}
      idleLabel="Use this site"
      loadingLabel="Fetching…"
      onSubmit={() => void onSubmit(url)}
    >
      {({ isDisabled }) => (
        <Input
          type="url"
          placeholder="https://yourbusiness.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isDisabled}
        />
      )}
    </IngestForm>
  );
}
