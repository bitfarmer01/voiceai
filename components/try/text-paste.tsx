"use client";

import * as React from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UploadState } from "./doc-uploader";

interface TextPasteProps {
  onSubmit: (text: string) => Promise<void>;
  state: UploadState;
  disabled?: boolean;
}

export function TextPaste({ onSubmit, state, disabled }: TextPasteProps) {
  const [text, setText] = React.useState("");

  const isLoading = state.status === "analyzing";
  const isDisabled = disabled || isLoading;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void onSubmit(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void onSubmit(text);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Textarea
        placeholder="Paste your About page, FAQ, or any business description here…"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
      />

      {state.status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isDisabled}>
        {isLoading ? (
          <>
            <CircleNotch className="size-4 animate-spin" />
            Analyzing…
          </>
        ) : (
          "Use this text"
        )}
      </Button>
    </form>
  );
}
