import { z } from "zod";

/**
 * Injection-stripper. Removes prompt injection attempts.
 */
export function sanitize(s: string): string {
  return s.replace(/^(ignore\b|you are\b|system:|<|forget\b)/gim, "[redacted]").trim();
}

/**
 * Sanitizes all string fields in a business profile object.
 */
export function sanitizeProfile(object: {
  companyName: string;
  hours: string;
  services: string[];
  policies: string[];
  availability: string;
  chunks: Array<{ text: string; tags: string[] }>;
}) {
  return {
    companyName: sanitize(object.companyName),
    hours: sanitize(object.hours),
    services: object.services.map(sanitize),
    policies: object.policies.map(sanitize),
    availability: sanitize(object.availability),
    chunks: object.chunks.map((c) => ({ text: sanitize(c.text), tags: c.tags })),
  };
}

/**
 * Returns the Zod schema for business profile extraction.
 */
export function businessProfileSchema(z: typeof import("zod")) {
  return z.object({
    companyName: z.string().max(120),
    hours: z.string().max(200),
    services: z.array(z.string().max(80)).max(10),
    policies: z.array(z.string().max(200)).max(10),
    availability: z.string().max(200),
    chunks: z
      .array(z.object({ text: z.string().max(400), tags: z.array(z.string().max(40)).max(5) }))
      .max(20),
  });
}

/**
 * Checks if a MIME type is a supported image format.
 */
export function isImageMime(mimeType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp"].includes(mimeType);
}

/**
 * Converts a buffer to a data URL.
 */
export function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Builds the extraction prompt for the LLM.
 */
export function buildExtractionPrompt(text: string): string {
  return `Extract a structured business profile from the following business document.
Return valid JSON with the schema provided.
chunks: up to 20 FAQ/policy sentences a phone receptionist would use to answer caller questions.

Document:
${text}`;
}

/**
 * Builds the OCR prompt for image text extraction.
 */
export function buildOcrPrompt(): string {
  return "Extract all text from this image exactly as it appears. Return only the extracted text, no commentary.";
}

/**
 * Builds the form expansion prompt for the LLM.
 */
export function buildFormExpansionPrompt(input: {
  companyName: string;
  industry: string;
  description: string;
}): string {
  return `You are a business profile writer. Expand the following minimal business description into a full structured business profile.
Company name: ${input.companyName}
Industry: ${input.industry}
Description: ${input.description}

Return valid JSON with the schema provided. Generate realistic hours, services, policies, and FAQ chunks that fit the industry and description.
chunks: up to 20 FAQ/policy sentences a phone receptionist would use to answer caller questions.`;
}

/**
 * Validates and clamps form input fields.
 */
export function clampFormInput(raw: {
  companyName: string;
  industry: string;
  description: string;
}): { companyName: string; industry: string; description: string } {
  const companyName = raw.companyName.trim();
  const industry = raw.industry.trim();
  const description = raw.description.trim();

  if (!companyName) {
    throw new Error("ingest_failed: company name is required");
  }

  if (companyName.length < 2) {
    throw new Error("ingest_failed: company name must be at least 2 characters");
  }

  return {
    companyName: companyName.slice(0, 120),
    industry: industry.slice(0, 80),
    description: description.slice(0, 2000),
  };
}

/**
 * Converts HTML to plain text.
 */
export function htmlToText(html: string): string {
  // Remove <script> blocks
  let text = html.replace(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi, "");

  // Remove <style> blocks
  text = text.replace(/(<style\b[^>]*>[\s\S]*?<\/style>)/gi, "");

  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Validates that a URL is safe (not localhost, private IP, or invalid).
 */
export function assertSafeUrl(urlStr: string): void {
  let url: URL;

  try {
    url = new URL(urlStr);
  } catch {
    throw new Error("ingest_failed: invalid or unsafe URL");
  }

  // Check protocol
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("ingest_failed: invalid or unsafe URL");
  }

  const hostname = url.hostname.toLowerCase();

  // Check localhost and .local domains
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("ingest_failed: invalid or unsafe URL");
  }

  // Check private IPs
  if (
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    (hostname.startsWith("172.") &&
      (() => {
        const secondOctet = parseInt(hostname.split(".")[1], 10);
        return secondOctet >= 16 && secondOctet <= 31;
      })()) ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "fc00::" ||
    hostname === "fe80::"
  ) {
    throw new Error("ingest_failed: invalid or unsafe URL");
  }
}
