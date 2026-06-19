"use node";

import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  sanitizeProfile,
  businessProfileSchema,
  clampFormInput,
  clampDraftInput,
  buildExtractionPrompt,
  buildFormExpansionPrompt,
  buildFormDraftPrompt,
  buildSuggestPrompt,
  htmlToText,
  assertSafeUrl,
} from "./lib/ingest_helpers";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NIM_MODEL = "nvidia/nemotron-3-nano-30b-a3b";
const MAX_TEXT_CHARS = 50_000;

/**
 * Shared extraction + insert pipeline used by every ingest source.
 * Runs the NIM structured-extraction call against the given prompt, sanitizes the
 * resulting profile, and inserts the uploaded business. Only the prompt differs
 * between sources (document extraction vs. form expansion). Document sources also
 * pass `sourceMeta` (the storage handle + original filename/mime) so it is recorded
 * on the inserted business; text/URL/form sources omit it.
 */
export async function extractAndInsert(
  ctx: ActionCtx,
  sessionId: string,
  prompt: string,
  sourceMeta?: { storageId?: Id<"_storage">; fileName?: string; mimeType?: string },
): Promise<{ businessId: Id<"businesses"> }> {
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
    prompt,
  });

  const sanitized = sanitizeProfile(object);

  const businessId = await ctx.runMutation(internal.businesses.insertUploadedBusiness, {
    sessionId,
    ...(sourceMeta ?? {}),
    ...sanitized,
  });

  return { businessId };
}

export const ingestText = action({
  args: {
    sessionId: v.string(),
    text: v.string(),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    const trimmed = args.text.trim();
    const text = trimmed.length > MAX_TEXT_CHARS ? trimmed.slice(0, MAX_TEXT_CHARS) : trimmed;
    if (text.length < 50) throw new Error("ingest_failed: too little text");

    return extractAndInsert(ctx, args.sessionId, buildExtractionPrompt(text));
  },
});

export const ingestUrl = action({
  args: {
    sessionId: v.string(),
    url: v.string(),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    await assertSafeUrl(args.url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let html: string;
    try {
      const res = await fetch(args.url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VoiceAI/1.0)" },
      });
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        throw new Error("ingest_failed: redirects not supported — paste the final URL directly");
      }
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

    return extractAndInsert(ctx, args.sessionId, buildExtractionPrompt(text));
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

    return extractAndInsert(ctx, args.sessionId, buildFormExpansionPrompt(clamped));
  },
});

/**
 * Profile shape produced by the guided form draft / accepted before insert. Shared by
 * `generateDraftProfile` (output) and `createBusinessFromProfile` (input).
 */
type DraftProfile = {
  companyName: string;
  hours: string;
  services: string[];
  policies: string[];
  availability: string;
  chunks: Array<{ text: string; tags: string[] }>;
};

const draftProfileValidator = v.object({
  companyName: v.string(),
  hours: v.string(),
  services: v.array(v.string()),
  policies: v.array(v.string()),
  availability: v.string(),
  chunks: v.array(v.object({ text: v.string(), tags: v.array(v.string()) })),
});

/**
 * Guided-form draft: turns business name + type + services into a full structured
 * profile via NIM, WITHOUT inserting anything. The /try form shows the draft for the
 * owner to review/edit, then calls `createBusinessFromProfile` to persist it.
 */
export const generateDraftProfile = action({
  args: {
    companyName: v.string(),
    businessType: v.string(),
    services: v.array(v.string()),
  },
  returns: draftProfileValidator,
  handler: async (ctx, args): Promise<DraftProfile> => {
    const clamped = clampDraftInput({
      companyName: args.companyName,
      businessType: args.businessType,
      services: args.services,
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
      prompt: buildFormDraftPrompt(clamped),
    });

    return sanitizeProfile(object);
  },
});

/**
 * Persists a (reviewed) guided-form profile as an uploaded business. Re-sanitizes the
 * profile defensively, then reuses `insertUploadedBusiness` (no source meta — this is a
 * form-drafted business, not an uploaded document).
 */
export const createBusinessFromProfile = action({
  args: {
    sessionId: v.string(),
    companyName: v.string(),
    hours: v.string(),
    services: v.array(v.string()),
    policies: v.array(v.string()),
    availability: v.string(),
    chunks: v.array(v.object({ text: v.string(), tags: v.array(v.string()) })),
  },
  returns: v.object({ businessId: v.id("businesses") }),
  handler: async (ctx, args): Promise<{ businessId: Id<"businesses"> }> => {
    const sanitized = sanitizeProfile({
      companyName: args.companyName,
      hours: args.hours,
      services: args.services,
      policies: args.policies,
      availability: args.availability,
      chunks: args.chunks,
    });

    const businessId = await ctx.runMutation(internal.businesses.insertUploadedBusiness, {
      sessionId: args.sessionId,
      ...sanitized,
    });

    return { businessId };
  },
});

/**
 * Best-effort autocomplete for the guided form. Suggests a normalized business-type
 * label or a list of likely services via a small focused NIM call. Never throws —
 * returns `{}` on any failure so the form keeps working.
 */
export const suggestField = action({
  args: {
    field: v.union(v.literal("businessType"), v.literal("services")),
    companyName: v.optional(v.string()),
    businessType: v.optional(v.string()),
    partial: v.optional(v.string()),
    existing: v.optional(v.array(v.string())),
  },
  returns: v.object({
    suggestion: v.optional(v.string()),
    suggestions: v.optional(v.array(v.string())),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ suggestion?: string; suggestions?: string[] }> => {
    try {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const { generateObject } = await import("ai");
      const { z } = await import("zod");

      const nim = createOpenAI({
        baseURL: NIM_BASE_URL,
        apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
      });

      if (args.field === "businessType") {
        const { object } = await generateObject({
          model: nim(NIM_MODEL),
          schema: z.object({ suggestion: z.string().max(80) }),
          prompt: buildSuggestPrompt({
            field: "businessType",
            companyName: args.companyName,
            partial: args.partial,
          }),
        });
        return { suggestion: object.suggestion };
      }

      const { object } = await generateObject({
        model: nim(NIM_MODEL),
        schema: z.object({ suggestions: z.array(z.string().max(80)).max(6) }),
        prompt: buildSuggestPrompt({
          field: "services",
          companyName: args.companyName,
          businessType: args.businessType,
          existing: args.existing,
        }),
      });
      return { suggestions: object.suggestions };
    } catch {
      // Suggestions are best-effort — never break the form.
      return {};
    }
  },
});
