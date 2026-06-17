"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NIM_MODEL = "nvidia/nemotron-3-nano-30b-a3b";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_CHARS = 50_000;

function sanitize(s: string): string {
  return s.replace(/^(ignore\b|you are\b|system:|<|forget\b)/gim, "[redacted]").trim();
}

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
    try {
      rawText = await extractText(buffer, args.mimeType);
    } catch {
      throw new Error("ingest_failed: could not parse file content");
    }
    if (rawText.trim().length < 50) {
      throw new Error("ingest_failed: too little text extracted from file");
    }
    const text = rawText.length > MAX_TEXT_CHARS ? rawText.slice(0, MAX_TEXT_CHARS) : rawText;

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const nim = createOpenAI({
      baseURL: NIM_BASE_URL,
      apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
    });

    const { object } = await generateObject({
      model: nim(NIM_MODEL),
      schema: z.object({
        companyName: z.string().max(120),
        hours: z.string().max(200),
        services: z.array(z.string().max(80)).max(10),
        policies: z.array(z.string().max(200)).max(10),
        availability: z.string().max(200),
        chunks: z
          .array(
            z.object({
              text: z.string().max(400),
              tags: z.array(z.string().max(40)).max(5),
            }),
          )
          .max(20),
      }),
      prompt: [
        "Extract a structured business profile from the following business document.",
        "Return valid JSON with the schema provided.",
        "chunks: up to 20 FAQ/policy sentences a phone receptionist would use to answer caller questions.",
        "",
        "Document:",
        text,
      ].join("\n"),
    });

    const businessId = await ctx.runMutation(
      internal.businesses.insertUploadedBusiness,
      {
        sessionId: args.sessionId,
        storageId: args.storageId,
        fileName: args.fileName,
        mimeType: args.mimeType,
        companyName: sanitize(object.companyName),
        hours: sanitize(object.hours),
        services: object.services.map(sanitize),
        policies: object.policies.map(sanitize),
        availability: sanitize(object.availability),
        chunks: object.chunks.map((c) => ({
          text: sanitize(c.text),
          tags: c.tags,
        })),
      },
    );

    return { businessId };
  },
});
