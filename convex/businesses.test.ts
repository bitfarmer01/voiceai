import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const PROFILE = {
  companyName: "Hale Park Law",
  hours: "Mon–Fri 9am–5pm",
  services: ["Estate planning", "Family law"],
  policies: ["Free 15-min consult"],
  availability: "By appointment",
};
const CHUNKS = [
  { text: "We offer free 15-minute consultations.", tags: ["policy"] },
  { text: "Parking is available behind the building.", tags: ["faq"] },
];

test("upsertConfigured inserts a configured business readable by slug", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.businesses.upsertConfigured, {
    slug: "hale-park-law",
    name: "Hale Park Law",
    profile: PROFILE,
    chunks: CHUNKS,
  });
  expect(id).toBeTruthy();

  const got = await t.query(api.businesses.getBySlug, { slug: "hale-park-law" });
  expect(got).not.toBeNull();
  expect(got!._id).toBe(id);
  expect(got!.name).toBe("Hale Park Law");
  expect(got!.profile.companyName).toBe("Hale Park Law");
  expect(got!.profile.services).toEqual(["Estate planning", "Family law"]);
  expect(got!.chunks).toHaveLength(2);
});

test("getBySlug returns null for an unknown slug", async () => {
  const t = convexTest(schema, modules);
  const got = await t.query(api.businesses.getBySlug, { slug: "nope" });
  expect(got).toBeNull();
});

test("upsertConfigured overwrites: same slug replaces profile + chunks, no duplicate row, no leftover chunks", async () => {
  const t = convexTest(schema, modules);
  const firstId = await t.mutation(api.businesses.upsertConfigured, {
    slug: "hale-park-law",
    name: "Hale Park Law",
    profile: PROFILE,
    chunks: CHUNKS,
  });

  const secondId = await t.mutation(api.businesses.upsertConfigured, {
    slug: "hale-park-law",
    name: "Hale Park Law LLP",
    profile: { ...PROFILE, companyName: "Hale Park Law LLP", services: ["Estate planning"] },
    chunks: [{ text: "Now open Saturdays.", tags: ["hours"] }],
  });

  // Upsert reuses the same row (not a second insert).
  expect(secondId).toBe(firstId);

  const got = await t.query(api.businesses.getBySlug, { slug: "hale-park-law" });
  expect(got!.name).toBe("Hale Park Law LLP");
  expect(got!.profile.companyName).toBe("Hale Park Law LLP");
  expect(got!.profile.services).toEqual(["Estate planning"]);
  // Old chunks deleted; only the single new one remains.
  expect(got!.chunks).toHaveLength(1);
  expect(got!.chunks[0].text).toBe("Now open Saturdays.");
});

test("getBySlug is case-insensitive: a mixed-case lookup finds a lowercase-saved business", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.businesses.upsertConfigured, {
    slug: "Hale-Park-Law",
    name: "Hale Park Law",
    profile: PROFILE,
    chunks: [],
  });
  const got = await t.query(api.businesses.getBySlug, { slug: "hale-park-law" });
  expect(got).not.toBeNull();
  expect(got!.name).toBe("Hale Park Law");
});

test("upsertConfigured normalizes slug: different-case saves hit the SAME row", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.businesses.upsertConfigured, {
    slug: "Hale-Park-Law",
    name: "Hale Park Law",
    profile: PROFILE,
    chunks: [],
  });
  const second = await t.mutation(api.businesses.upsertConfigured, {
    slug: "  HALE-PARK-LAW  ",
    name: "Hale Park Law LLP",
    profile: { ...PROFILE, companyName: "Hale Park Law LLP" },
    chunks: [],
  });
  expect(second).toBe(first); // same row, not a duplicate
  const got = await t.query(api.businesses.getBySlug, { slug: "hale-park-law" });
  expect(got!.name).toBe("Hale Park Law LLP");
  // Exactly one configured business exists for this slug.
  const rows = await t.run((ctx) =>
    ctx.db.query("businesses").withIndex("by_slug", (q) => q.eq("slug", "hale-park-law")).collect(),
  );
  expect(rows).toHaveLength(1);
});

test("configured business has no expiresAt and kind 'configured'", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.businesses.upsertConfigured, {
    slug: "no-expiry",
    name: "No Expiry Co",
    profile: PROFILE,
    chunks: [],
  });
  const row = await t.run(async (ctx) =>
    ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", "no-expiry"))
      .first(),
  );
  expect(row).not.toBeNull();
  expect(row!.kind).toBe("configured");
  expect(row!.expiresAt).toBeUndefined();
});
