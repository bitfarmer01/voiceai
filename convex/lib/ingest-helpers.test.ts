import { describe, it, expect } from "vitest";
import {
  sanitize,
  sanitizeProfile,
  businessProfileSchema,
  isImageMime,
  toDataUrl,
  buildExtractionPrompt,
  buildOcrPrompt,
  buildFormExpansionPrompt,
  clampFormInput,
  htmlToText,
  assertSafeUrl,
} from "./ingest-helpers";
import { z } from "zod";

describe("sanitize", () => {
  it("removes 'ignore' prefix", () => {
    const result = sanitize("ignore all previous");
    expect(result).toMatch(/^\[redacted\]/);
  });

  it("removes 'you are' prefix", () => {
    const result = sanitize("you are a pirate");
    expect(result).toMatch(/^\[redacted\]/);
  });

  it("removes 'system:' prefix", () => {
    const result = sanitize("system: do this");
    expect(result).toMatch(/^\[redacted\]/);
  });

  it("leaves normal text unchanged", () => {
    const result = sanitize("Normal text");
    expect(result).toBe("Normal text");
  });

  it("trims whitespace", () => {
    const result = sanitize("  Normal text  ");
    expect(result).toBe("Normal text");
  });
});

describe("isImageMime", () => {
  it("returns true for image/png", () => {
    expect(isImageMime("image/png")).toBe(true);
  });

  it("returns true for image/jpeg", () => {
    expect(isImageMime("image/jpeg")).toBe(true);
  });

  it("returns true for image/webp", () => {
    expect(isImageMime("image/webp")).toBe(true);
  });

  it("returns false for application/pdf", () => {
    expect(isImageMime("application/pdf")).toBe(false);
  });

  it("returns false for text/plain", () => {
    expect(isImageMime("text/plain")).toBe(false);
  });
});

describe("toDataUrl", () => {
  it("converts buffer to data URL", () => {
    const buffer = Buffer.from("hello");
    const result = toDataUrl(buffer, "image/png");
    expect(result).toBe("data:image/png;base64,aGVsbG8=");
  });
});

describe("clampFormInput", () => {
  it("throws when companyName is empty after trim", () => {
    expect(() => clampFormInput({ companyName: "", industry: "test", description: "test" })).toThrow(
      "ingest_failed: company name is required"
    );
  });

  it("throws when companyName is 1 character", () => {
    expect(() => clampFormInput({ companyName: "A", industry: "test", description: "test" })).toThrow(
      "ingest_failed: company name must be at least 2 characters"
    );
  });

  it("clamps companyName to 120 chars", () => {
    const longName = "A".repeat(150);
    const result = clampFormInput({ companyName: longName, industry: "test", description: "test" });
    expect(result.companyName).toHaveLength(120);
  });

  it("clamps industry to 80 chars", () => {
    const longIndustry = "A".repeat(100);
    const result = clampFormInput({ companyName: "AB", industry: longIndustry, description: "test" });
    expect(result.industry).toHaveLength(80);
  });

  it("clamps description to 2000 chars", () => {
    const longDescription = "A".repeat(3000);
    const result = clampFormInput({ companyName: "AB", industry: "test", description: longDescription });
    expect(result.description).toHaveLength(2000);
  });

  it("trims whitespace from all fields", () => {
    const result = clampFormInput({
      companyName: "  AB  ",
      industry: "  test  ",
      description: "  test  ",
    });
    expect(result.companyName).toBe("AB");
    expect(result.industry).toBe("test");
    expect(result.description).toBe("test");
  });

  it("returns valid input unchanged", () => {
    const result = clampFormInput({
      companyName: "Company",
      industry: "Tech",
      description: "A tech company",
    });
    expect(result).toEqual({
      companyName: "Company",
      industry: "Tech",
      description: "A tech company",
    });
  });
});

describe("buildExtractionPrompt", () => {
  it("contains 'Document:'", () => {
    const result = buildExtractionPrompt("test");
    expect(result).toContain("Document:");
  });

  it("contains the passed text", () => {
    const text = "My custom text";
    const result = buildExtractionPrompt(text);
    expect(result).toContain(text);
  });

  it("contains 'chunks'", () => {
    const result = buildExtractionPrompt("test");
    expect(result).toContain("chunks");
  });
});

describe("buildOcrPrompt", () => {
  it("returns a non-empty string", () => {
    const result = buildOcrPrompt();
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});

describe("buildFormExpansionPrompt", () => {
  it("contains companyName, industry, and description", () => {
    const result = buildFormExpansionPrompt({
      companyName: "MyCompany",
      industry: "Tech",
      description: "A tech startup",
    });
    expect(result).toContain("MyCompany");
    expect(result).toContain("Tech");
    expect(result).toContain("A tech startup");
  });

  it("contains 'chunks'", () => {
    const result = buildFormExpansionPrompt({
      companyName: "MyCompany",
      industry: "Tech",
      description: "A tech startup",
    });
    expect(result).toContain("chunks");
  });
});

describe("htmlToText", () => {
  it("strips <script> blocks and content", () => {
    const html = "<p>Start</p><script>alert('bad')</script><p>End</p>";
    const result = htmlToText(html);
    expect(result).toContain("Start");
    expect(result).toContain("End");
    expect(result).not.toContain("alert");
  });

  it("strips <style> blocks and content", () => {
    const html = "<style>.hidden { display: none; }</style><p>Text</p>";
    const result = htmlToText(html);
    expect(result).toContain("Text");
    expect(result).not.toContain(".hidden");
  });

  it("strips HTML tags", () => {
    const html = "<p>Hello <b>world</b></p>";
    const result = htmlToText(html);
    expect(result).toBe("Hello world");
  });

  it("decodes &amp;", () => {
    const html = "<p>Hello &amp; goodbye</p>";
    const result = htmlToText(html);
    expect(result).toBe("Hello & goodbye");
  });

  it("decodes &lt;", () => {
    const html = "<p>&lt;tag&gt;</p>";
    const result = htmlToText(html);
    expect(result).toContain("<tag>");
  });

  it("decodes &nbsp;", () => {
    const html = "<p>Hello&nbsp;world</p>";
    const result = htmlToText(html);
    expect(result).toContain("Hello world");
  });

  it("collapses whitespace", () => {
    const html = "<p>Hello    \n\n    world</p>";
    const result = htmlToText(html);
    expect(result).toBe("Hello world");
  });

  it("handles complete example", () => {
    const html = "<p>Hello &amp; world</p>";
    const result = htmlToText(html);
    expect(result).toBe("Hello & world");
  });
});

describe("assertSafeUrl", () => {
  it("allows https://example.com", () => {
    expect(() => assertSafeUrl("https://example.com")).not.toThrow();
  });

  it("allows http://example.com/path", () => {
    expect(() => assertSafeUrl("http://example.com/path")).not.toThrow();
  });

  it("throws for http://localhost", () => {
    expect(() => assertSafeUrl("http://localhost")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for http://127.0.0.1", () => {
    expect(() => assertSafeUrl("http://127.0.0.1")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for http://192.168.1.1", () => {
    expect(() => assertSafeUrl("http://192.168.1.1")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for http://10.0.0.1", () => {
    expect(() => assertSafeUrl("http://10.0.0.1")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for http://172.16.0.1", () => {
    expect(() => assertSafeUrl("http://172.16.0.1")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for http://172.31.255.255", () => {
    expect(() => assertSafeUrl("http://172.31.255.255")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for http://my.local", () => {
    expect(() => assertSafeUrl("http://my.local")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for ftp://example.com", () => {
    expect(() => assertSafeUrl("ftp://example.com")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for file:///etc/passwd", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("throws for not-a-url", () => {
    expect(() => assertSafeUrl("not-a-url")).toThrow("ingest_failed: invalid or unsafe URL");
  });
});

describe("businessProfileSchema", () => {
  it("returns a valid Zod schema", () => {
    const schema = businessProfileSchema(z);
    expect(schema).toBeDefined();
    // Just verify it's a schema object with parse method
    expect(typeof schema.parse).toBe("function");
  });
});

describe("sanitizeProfile", () => {
  it("sanitizes all string fields", () => {
    const profile = {
      companyName: "ignore my company",
      hours: "9-5",
      services: ["ignore this service"],
      policies: ["you are a policy"],
      availability: "always",
      chunks: [{ text: "system: do this", tags: ["tag1"] }],
    };

    const result = sanitizeProfile(profile);

    expect(result.companyName).toMatch(/^\[redacted\]/);
    expect(result.services[0]).toMatch(/^\[redacted\]/);
    expect(result.policies[0]).toMatch(/^\[redacted\]/);
    expect(result.chunks[0].text).toMatch(/^\[redacted\]/);
    expect(result.chunks[0].tags).toEqual(["tag1"]); // tags are not sanitized
  });
});
