"use client";

import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { DocUploader, type UploadState } from "@/components/try/doc-uploader";
import { TextPaste } from "@/components/try/text-paste";
import { UrlInput } from "@/components/try/url-input";
import type { ConvexBusinessForAssistant } from "@/lib/vapi/assistant";

/**
 * OtherWays — the quiet fallback for owners who'd rather not fill the guided form:
 * paste text, drop a link, or upload a document. Reuses the existing ingest
 * actions; on success it loads the created business and hands it back via
 * `onReady` (no review step — that's exclusive to the guided draft path).
 */
export function OtherWays({
  sessionId,
  onReady,
  disabled,
}: {
  sessionId: string;
  onReady: (biz: ConvexBusinessForAssistant) => void;
  disabled?: boolean;
}) {
  const [source, setSource] = React.useState<"paste" | "link" | "upload">("paste");
  const [uploadState, setUploadState] = React.useState<UploadState>({ status: "idle" });

  const generateUploadUrlM = useMutation(api.businesses.generateUploadUrl);
  const ingestDocumentA = useAction(api.ingest.ingestDocument);
  const ingestTextA = useAction(api.sources.ingestText);
  const ingestUrlA = useAction(api.sources.ingestUrl);

  const readyId = uploadState.status === "ready" ? uploadState.businessId : null;
  const bizQ = useQuery(
    api.businesses.getWithChunks,
    readyId ? { businessId: readyId as Id<"businesses"> } : "skip",
  );
  const firedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (bizQ && readyId && firedRef.current !== readyId) {
      firedRef.current = readyId;
      onReady({
        _id: bizQ._id,
        name: bizQ.name,
        profile: bizQ.profile,
        chunks: bizQ.chunks.map((c) => ({ text: c.text })),
      });
    }
  }, [bizQ, readyId, onReady]);

  const handlePasteText = React.useCallback(
    async (text: string) => {
      setUploadState({ status: "analyzing" });
      try {
        const { businessId } = await ingestTextA({ sessionId, text });
        setUploadState({ status: "ready", businessId, fileName: "Pasted text" });
      } catch (e) {
        setUploadState({
          status: "error",
          message: e instanceof Error ? e.message : "Couldn't process that text — try another source.",
        });
      }
    },
    [ingestTextA, sessionId],
  );

  const handleIngestUrl = React.useCallback(
    async (url: string) => {
      setUploadState({ status: "analyzing" });
      try {
        const { businessId } = await ingestUrlA({ sessionId, url });
        const domain = new URL(url).hostname;
        setUploadState({ status: "ready", businessId, fileName: domain });
      } catch (e) {
        setUploadState({
          status: "error",
          message: e instanceof Error ? e.message : "Couldn't fetch that URL — try pasting text instead.",
        });
      }
    },
    [ingestUrlA, sessionId],
  );

  const handleIngest = React.useCallback(
    async (file: File) => {
      setUploadState({ status: "uploading", progress: 0 });
      try {
        const uploadUrl = await generateUploadUrlM({});
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = await res.json();
        setUploadState({ status: "analyzing" });
        const { businessId } = await ingestDocumentA({
          storageId,
          sessionId,
          fileName: file.name,
          mimeType: file.type || "text/plain",
        });
        setUploadState({ status: "ready", businessId, fileName: file.name });
      } catch (e) {
        setUploadState({
          status: "error",
          message: e instanceof Error ? e.message : "Couldn't read that file — try another or use the form.",
        });
      }
    },
    [generateUploadUrlM, ingestDocumentA, sessionId],
  );

  const tabs: { id: typeof source; label: string }[] = [
    { id: "paste", label: "Paste text" },
    { id: "link", label: "Website link" },
    { id: "upload", label: "Upload a file" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border bg-muted p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setSource(t.id);
              setUploadState({ status: "idle" });
            }}
            className={cn(
              "flex-1 rounded py-1 text-xs font-medium transition-colors",
              source === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {source === "paste" ? (
        <TextPaste onSubmit={handlePasteText} state={uploadState} disabled={disabled} />
      ) : source === "link" ? (
        <UrlInput onSubmit={handleIngestUrl} state={uploadState} disabled={disabled} />
      ) : (
        <DocUploader onIngest={handleIngest} state={uploadState} disabled={disabled} />
      )}
    </div>
  );
}
