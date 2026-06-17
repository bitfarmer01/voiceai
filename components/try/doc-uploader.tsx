"use client";

import * as React from "react";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "analyzing" }
  | { status: "ready"; businessId: string; fileName: string }
  | { status: "error"; message: string };

interface DocUploaderProps {
  onIngest: (file: File) => Promise<void>;
  state: UploadState;
  disabled?: boolean;
}

const ACCEPTED =
  ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp";
const MAX_MB = 5;

export function DocUploader({ onIngest, state, disabled }: DocUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const handleFile = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) return;
    await onIngest(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  const isLoading = state.status === "uploading" || state.status === "analyzing";

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-label="Upload a business document"
        disabled={disabled || isLoading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging && "border-primary bg-accent",
          !dragging && state.status === "ready" && "border-primary/40 bg-accent/50",
          !dragging &&
            state.status !== "ready" &&
            "border-border hover:border-primary/50 hover:bg-muted",
          (disabled || isLoading) && "cursor-not-allowed opacity-50",
        )}
      >
        {state.status === "ready" ? (
          <>
            <CheckCircle2 className="size-6 text-primary" />
            <span className="text-sm font-medium text-foreground">{state.fileName}</span>
            <span className="text-xs text-muted-foreground">Ready — click to replace</span>
          </>
        ) : isLoading ? (
          <>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {state.status === "uploading" ? "Uploading…" : "Analyzing with AI…"}
            </span>
          </>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">Drop a doc or click to browse</span>
            <span className="text-xs text-muted-foreground">PDF · DOCX · TXT · PNG · JPG · max 5 MB</span>
          </>
        )}
      </button>

      {state.status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={onInputChange}
        tabIndex={-1}
      />
    </div>
  );
}
