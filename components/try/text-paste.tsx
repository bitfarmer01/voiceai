"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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

  const handleClick = () => {
    void onSubmit(text);
  };

  return (
    <div className="space-y-4">
      <Textarea
        placeholder="Paste your About page, FAQ, or any business description here…"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isDisabled}
      />

      {state.status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <Button type="button" className="w-full" onClick={handleClick} disabled={isDisabled}>
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Analyzing…
          </>
        ) : (
          "Use this text"
        )}
      </Button>
    </div>
  );
}
