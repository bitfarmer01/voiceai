import { describe, it, expect, vi } from "vitest";
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
  isPrivateOrReservedIp,
} from "./ingest_helpers";
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

  it("throws when industry is blank after trim", () => {
    expect(() =>
      clampFormInput({ companyName: "Acme", industry: "  ", description: "" })
    ).toThrow("ingest_failed: industry is required");
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
  it("references the document to extract from", () => {
    const result = buildExtractionPrompt("test");
    expect(result.toLowerCase()).toContain("document");
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

  it("fences the ingested text in explicit untrusted-content delimiters", () => {
    const text = "My custom text";
    const result = buildExtractionPrompt(text);
    expect(result).toContain("<<<UNTRUSTED_DOCUMENT");
    expect(result).toContain("UNTRUSTED_DOCUMENT>>>");
    // The fenced text sits between the open and close markers.
    const open = result.indexOf("<<<UNTRUSTED_DOCUMENT");
    const close = result.indexOf("UNTRUSTED_DOCUMENT>>>");
    const textIdx = result.indexOf(text);
    expect(textIdx).toBeGreaterThan(open);
    expect(textIdx).toBeLessThan(close);
  });

  it("instructs the model to treat the delimited content as data only", () => {
    const result = buildExtractionPrompt("test");
    expect(result.toLowerCase()).toContain("untrusted");
    expect(result.toLowerCase()).toMatch(/not instructions|never follow|ignore any/);
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

  it("decodes hex numeric entities (&#x27;)", () => {
    const html = "<p>it&#x27;s here</p>";
    const result = htmlToText(html);
    expect(result).toBe("it's here");
  });

  it("decodes decimal numeric entities (&#8212;)", () => {
    const html = "<p>a &#8212; b</p>";
    const result = htmlToText(html);
    expect(result).toBe("a — b");
  });

  it("decodes &mdash; named entity", () => {
    const html = "<p>a &mdash; b</p>";
    const result = htmlToText(html);
    expect(result).toBe("a — b");
  });

  it("decodes &copy; and &hellip; named entities", () => {
    const html = "<p>&copy; 2026&hellip;</p>";
    const result = htmlToText(html);
    expect(result).toBe("© 2026…");
  });

  it("decodes &apos; named entity", () => {
    const html = "<p>it&apos;s</p>";
    const result = htmlToText(html);
    expect(result).toBe("it's");
  });
});

describe("isPrivateOrReservedIp", () => {
  it("flags IPv4 link-local / cloud metadata 169.254.169.254", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 loopback ::ffff:127.0.0.1", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("flags 0.0.0.1 (0/8)", () => {
    expect(isPrivateOrReservedIp("0.0.0.1")).toBe(true);
  });

  it("flags 10.0.0.1 (10/8)", () => {
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
  });

  it("flags 172.16.0.1 and 172.31.255.255 (172.16/12)", () => {
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
  });

  it("flags 192.168.1.1 (192.168/16)", () => {
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
  });

  it("flags 127.0.0.1 (127/8 loopback)", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
  });

  it("flags 100.64.0.1 (CGNAT 100.64/10)", () => {
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
  });

  it("flags IPv6 ::1, fc00::, fe80::", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd12:3456::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
  });

  it("returns false for public IPv4 addresses", () => {
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false); // example.com
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIp("172.15.0.1")).toBe(false); // just below 172.16/12
    expect(isPrivateOrReservedIp("172.32.0.1")).toBe(false); // just above 172.16/12
    expect(isPrivateOrReservedIp("100.63.255.255")).toBe(false); // just below CGNAT
    expect(isPrivateOrReservedIp("100.128.0.1")).toBe(false); // just above CGNAT
  });

  it("returns false for public IPv6 addresses", () => {
    expect(isPrivateOrReservedIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false); // example.com
    expect(isPrivateOrReservedIp("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("fails closed for unparseable / malformed input", () => {
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
    expect(isPrivateOrReservedIp("10.0.0")).toBe(true);
    expect(isPrivateOrReservedIp("999.0.0.1")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  // Hermetic DNS stubs injected via the optional `lookup` param — no real network.
  const publicLookup = vi.fn(async () => [{ address: "93.184.216.34" }]); // public IPv4
  const privateLookup = vi.fn(async () => [{ address: "169.254.169.254" }]); // cloud metadata

  it("allows https://example.com when it resolves to a public IP", async () => {
    await expect(
      assertSafeUrl("https://example.com", publicLookup)
    ).resolves.toBeUndefined();
  });

  it("allows http://example.com/path when it resolves to a public IP", async () => {
    await expect(
      assertSafeUrl("http://example.com/path", publicLookup)
    ).resolves.toBeUndefined();
  });

  it("rejects when DNS resolves a hostname to a private IP (DNS-rebind)", async () => {
    await expect(
      assertSafeUrl("https://rebind.example.com", privateLookup)
    ).rejects.toThrow("ingest_failed: invalid or unsafe URL");
  });

  it("rejects when DNS resolution fails (cannot prove safe)", async () => {
    const failingLookup = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    await expect(
      assertSafeUrl("https://nope.example.com", failingLookup)
    ).rejects.toThrow("ingest_failed: invalid or unsafe URL");
  });

  // The reject-cases below all throw on the synchronous pre-filter, BEFORE any DNS,
  // so the injected lookup is never consulted (passing publicLookup proves this).

  it("throws for http://localhost", async () => {
    await expect(assertSafeUrl("http://localhost", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://127.0.0.1", async () => {
    await expect(assertSafeUrl("http://127.0.0.1", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://192.168.1.1", async () => {
    await expect(assertSafeUrl("http://192.168.1.1", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://10.0.0.1", async () => {
    await expect(assertSafeUrl("http://10.0.0.1", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://172.16.0.1", async () => {
    await expect(assertSafeUrl("http://172.16.0.1", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://172.31.255.255", async () => {
    await expect(assertSafeUrl("http://172.31.255.255", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://169.254.169.254 (cloud metadata)", async () => {
    await expect(assertSafeUrl("http://169.254.169.254", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://0.0.0.1 (0/8)", async () => {
    await expect(assertSafeUrl("http://0.0.0.1", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://[::ffff:127.0.0.1] (IPv4-mapped IPv6 loopback)", async () => {
    await expect(assertSafeUrl("http://[::ffff:127.0.0.1]", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for http://my.local", async () => {
    await expect(assertSafeUrl("http://my.local", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for ftp://example.com", async () => {
    await expect(assertSafeUrl("ftp://example.com", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for file:///etc/passwd", async () => {
    await expect(assertSafeUrl("file:///etc/passwd", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
  });

  it("throws for not-a-url", async () => {
    await expect(assertSafeUrl("not-a-url", publicLookup)).rejects.toThrow(
      "ingest_failed: invalid or unsafe URL"
    );
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
