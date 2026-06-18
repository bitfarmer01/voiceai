import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// L5: a whitespace-heavy paste that exceeds MAX_TEXT_CHARS must be rejected, not
// silently sliced. After trim() the content is empty, so the <50 guard fires BEFORE
// any NIM call — making this assertable without mocking the AI SDK.
test("ingestText: rejects a whitespace-only paste larger than MAX_TEXT_CHARS", async () => {
  const t = convexTest(schema, modules);
  const whitespaceHeavy = " ".repeat(60_000); // > 50_000 MAX_TEXT_CHARS, all whitespace
  await expect(
    t.action(api.sources.ingestText, { sessionId: "sess-ws", text: whitespaceHeavy }),
  ).rejects.toThrow("ingest_failed: too little text");
});

test("insertUploadedBusiness: inserts business + chunks, sets expiresAt", async () => {
  const t = convexTest(schema, modules);
  const businessId = await t.mutation(internal.businesses.insertUploadedBusiness, {
    sessionId: "sess-1",
    storageId: "1_storage" as any,
    fileName: "test.txt",
    mimeType: "text/plain",
    companyName: "Test Co",
    hours: "Mon–Fri 9–5",
    services: ["Service A", "Service B"],
    policies: ["Policy 1"],
    availability: "Next week",
    chunks: [
      { text: "We are open Mon–Fri 9am to 5pm.", tags: ["hours"] },
      { text: "We offer Service A and Service B.", tags: ["services"] },
    ],
  });

  expect(businessId).toBeTruthy();

  const result = await t.query(api.businesses.getWithChunks, { businessId });
  expect(result).not.toBeNull();
  expect(result!.companyName).toBe("Test Co");
  expect(result!.hours).toBe("Mon–Fri 9–5");
  expect(result!.services).toEqual(["Service A", "Service B"]);
  expect(result!.chunks).toHaveLength(2);
  expect(result!.chunks[0].text).toBe("We are open Mon–Fri 9am to 5pm.");
});

test("insertUploadedBusiness: kind is upload and expiresAt is ~24h from now", async () => {
  const t = convexTest(schema, modules);
  const before = Date.now();
  const businessId = await t.mutation(internal.businesses.insertUploadedBusiness, {
    sessionId: "sess-2",
    storageId: "2_storage" as any,
    fileName: "doc.pdf",
    mimeType: "application/pdf",
    companyName: "Upload Co",
    hours: "9–5",
    services: [],
    policies: [],
    availability: "TBD",
    chunks: [],
  });
  const after = Date.now();

  const biz = await t.run(async (ctx) => ctx.db.get(businessId));
  expect(biz!.kind).toBe("upload");
  const expectedExpiry = before + 24 * 60 * 60 * 1000;
  expect(biz!.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
  expect(biz!.expiresAt).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + 1000);
});

test("getWithChunks: returns null for unknown businessId", async () => {
  const t = convexTest(schema, modules);
  const result = await t.query(api.businesses.getWithChunks, {
    businessId: "1businesses" as any,
  });
  expect(result).toBeNull();
});

test("insertUploadedBusiness with no storage args: inserts business, sourceMeta undefined, getWithChunks returns profile + chunks", async () => {
  const t = convexTest(schema, modules);
  const businessId = await t.mutation(internal.businesses.insertUploadedBusiness, {
    sessionId: "s1",
    companyName: "Acme",
    hours: "9-5",
    services: ["Consulting"],
    policies: ["No refunds"],
    availability: "Weekdays",
    chunks: [{ text: "We open at 9am", tags: ["hours"] }],
  });

  expect(businessId).toBeTruthy();

  const result = await t.query(api.businesses.getWithChunks, { businessId });
  expect(result).not.toBeNull();
  expect(result!.companyName).toBe("Acme");
  expect(result!.chunks).toHaveLength(1);
});
