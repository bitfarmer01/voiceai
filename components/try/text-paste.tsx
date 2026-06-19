"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { IngestForm } from "./ingest-form";
import type { UploadState } from "./doc-uploader";

interface TextPasteProps {
  onSubmit: (text: string) => Promise<void>;
  state: UploadState;
  disabled?: boolean;
}

export function TextPaste({ onSubmit, state, disabled }: TextPasteProps) {
  const [text, setText] = React.useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void onSubmit(text);
    }
  };

  return (
    <IngestForm
      state={state}
      disabled={disabled}
      idleLabel="Use this text"
      loadingLabel="Analyzing…"
      onSubmit={() => void onSubmit(text)}
    >
      {({ isDisabled }) => (
        <Textarea
          placeholder="Paste your About page, FAQ, or any business description here…"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
        />
      )}
    </IngestForm>
  );
}
