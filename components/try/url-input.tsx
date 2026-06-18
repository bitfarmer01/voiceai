"use client";

import * as React from "react";
import { CircleNotch } from "@phosphor-icons/react";
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void onSubmit(url);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
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

      <Button type="submit" className="w-full" disabled={isDisabled}>
        {isLoading ? (
          <>
            <CircleNotch className="size-4 animate-spin" />
            Fetching…
          </>
        ) : (
          "Use this site"
        )}
      </Button>
    </form>
  );
}
