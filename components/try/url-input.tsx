"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UploadState } from "./doc-uploader";

interface UrlInputProps {
  onSubmit: (url: string) => Promise<void>;
  state: UploadState;
  disabled?: boolean;
}

export function UrlInput({ onSubmit, state, disabled }: UrlInputProps) {
  const [url, setUrl] = React.useState("");

  const isLoading = state.status === "analyzing";
  const isDisabled = disabled || isLoading;

  const handleClick = () => {
    void onSubmit(url);
  };

  return (
    <div className="space-y-4">
      <Input
        type="url"
        placeholder="https://yourbusiness.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
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
            Fetching…
          </>
        ) : (
          "Fetch site"
        )}
      </Button>
    </div>
  );
}
