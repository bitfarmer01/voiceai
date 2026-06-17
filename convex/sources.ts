"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  sanitizeProfile,
  businessProfileSchema,
  clampFormInput,
  buildExtractionPrompt,
  buildFormExpansionPrompt,
  htmlToText,
  assertSafeUrl,
} from "./lib/ingest-helpers";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NIM_MODEL = "nvidia/nemotron-3-nano-30b-a3b";
const MAX_TEXT_CHARS = 50_000;

export const ingestText = action({
  args: {
    sessionId: v.string(),
    text: v.string(),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    const text =
      args.text.length > MAX_TEXT_CHARS ? args.text.slice(0, MAX_TEXT_CHARS) : args.text.trim();
    if (text.length < 50) throw new Error("ingest_failed: too little text");

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const nim = createOpenAI({
      baseURL: NIM_BASE_URL,
      apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
    });

    const { object } = await generateObject({
      model: nim(NIM_MODEL),
      schema: businessProfileSchema(z),
      prompt: buildExtractionPrompt(text),
    });

    const sanitized = sanitizeProfile(object);

    // @ts-ignore storageId/fileName/mimeType become optional in Task 4
    const businessId = await ctx.runMutation(internal.businesses.insertUploadedBusiness, {
      sessionId: args.sessionId,
      ...sanitized,
    });

    return { businessId };
  },
});

export const ingestUrl = action({
  args: {
    sessionId: v.string(),
    url: v.string(),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    assertSafeUrl(args.url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let html: string;
    try {
      const res = await fetch(args.url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VoiceAI/1.0)" },
      });
      if (!res.ok) throw new Error(`ingest_failed: HTTP ${res.status}`);
      const MAX_RESPONSE_BYTES = 1 * 1024 * 1024; // 1 MB
      const reader = res.body?.getReader();
      if (!reader) throw new Error("ingest_failed: no response body");
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      html = new TextDecoder().decode(
        chunks.reduce((acc, c) => {
          const merged = new Uint8Array(acc.byteLength + c.byteLength);
          merged.set(acc);
          merged.set(c, acc.byteLength);
          return merged;
        }, new Uint8Array(0)),
      );
    } finally {
      clearTimeout(timeout);
    }

    const rawText = htmlToText(html);
    if (rawText.trim().length < 50) throw new Error("ingest_failed: too little text extracted from URL");
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
      schema: businessProfileSchema(z),
      prompt: buildExtractionPrompt(text),
    });

    const sanitized = sanitizeProfile(object);

    // @ts-ignore storageId/fileName/mimeType become optional in Task 4
    const businessId = await ctx.runMutation(internal.businesses.insertUploadedBusiness, {
      sessionId: args.sessionId,
      ...sanitized,
    });

    return { businessId };
  },
});

export const generateFromForm = action({
  args: {
    sessionId: v.string(),
    companyName: v.string(),
    industry: v.string(),
    description: v.string(),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    const clamped = clampFormInput({
      companyName: args.companyName,
      industry: args.industry,
      description: args.description,
    });

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const nim = createOpenAI({
      baseURL: NIM_BASE_URL,
      apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
    });

    const { object } = await generateObject({
      model: nim(NIM_MODEL),
      schema: businessProfileSchema(z),
      prompt: buildFormExpansionPrompt(clamped),
    });

    const sanitized = sanitizeProfile(object);

    // @ts-ignore storageId/fileName/mimeType become optional in Task 4
    const businessId = await ctx.runMutation(internal.businesses.insertUploadedBusiness, {
      sessionId: args.sessionId,
      ...sanitized,
    });

    return { businessId };
  },
});
