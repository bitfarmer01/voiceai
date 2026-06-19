"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  isImageMime,
  toDataUrl,
  buildExtractionPrompt,
  buildOcrPrompt,
} from "./lib/ingest_helpers";
import { extractAndInsert } from "./sources";

// NIM_MODEL / sanitize / insert now live in extractAndInsert (./sources). Only the
// VLM OCR model + the file/text size caps remain document-specific here.
const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NIM_VLM_MODEL = "nvidia/llama-3.1-nemotron-nano-vl-8b-v1";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_CHARS = 50_000;

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText({ first: 20 });
    return result.text;
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString("utf-8");
}

export const ingestDocument = action({
  args: {
    storageId: v.id("_storage"),
    sessionId: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("ingest_failed: file not found in storage");

    const arrayBuffer = await blob.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
      throw new Error("ingest_failed: file exceeds 5 MB limit");
    }
    const buffer = Buffer.from(arrayBuffer);

    let rawText: string;
    if (isImageMime(args.mimeType)) {
      try {
        const { createOpenAI } = await import("@ai-sdk/openai");
        const { generateText } = await import("ai");
        const nimVlm = createOpenAI({
          baseURL: NIM_BASE_URL,
          apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
        });
        const { text } = await generateText({
          model: nimVlm(NIM_VLM_MODEL),
          messages: [
            {
              role: "user",
              content: [
                { type: "image", image: toDataUrl(buffer, args.mimeType) },
                { type: "text", text: buildOcrPrompt() },
              ],
            },
          ],
        });
        rawText = text;
      } catch {
        // VLM 5xx / missing key / network error — normalize to the ingest_failed
        // contract instead of leaking a raw SDK error.
        throw new Error("ingest_failed: could not read image content");
      }
    } else {
      try {
        rawText = await extractText(buffer, args.mimeType);
      } catch {
        throw new Error("ingest_failed: could not parse file content");
      }
    }

    if (rawText.trim().length < 50) {
      throw new Error("ingest_failed: too little text extracted from file");
    }
    const text = rawText.length > MAX_TEXT_CHARS ? rawText.slice(0, MAX_TEXT_CHARS) : rawText;

    // Same NIM-extract → sanitize → insert tail as every other source; the only
    // document-specific addition is recording the storage handle on the business.
    return extractAndInsert(ctx, args.sessionId, buildExtractionPrompt(text), {
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
    });
  },
});
