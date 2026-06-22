// convex/chat.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedConfigured(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("businesses", {
      sessionId: "seed",
      name: "Glow Dental",
      kind: "configured",
      chunkCount: 0,
      createdAt: Date.now(),
      profile: {
        companyName: "Glow Dental",
        hours: "Mon-Fri 9-5",
        services: ["cleaning"],
        policies: [],
        availability: "",
      },
    } as any),
  );
}

test("bookAppointment creates a single chat anchor and books against it", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);

  const res = await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-abc",
    slot: "2099-12-31T10:00",
    customerName: "Pat",
    contact: "pat@example.com",
    service: "cleaning",
  });

  expect(res.booked).toBe(true);
  expect(res.confirmationId).not.toBe("");

  // Exactly one anchor row, marked channel:"chat".
  const calls = await t.run(async (ctx) =>
    ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", "chat-abc")).collect(),
  );
  expect(calls.length).toBe(1);
  expect(calls[0].channel).toBe("chat");

  // A second booking on the same session reuses the same anchor (no duplicate).
  await t.mutation(api.chat.bookAppointment, {
    businessId: businessId as any,
    sessionId: "chat-abc",
    slot: "2099-12-31T11:00",
    customerName: "Pat",
    contact: "pat@example.com",
  });
  const calls2 = await t.run(async (ctx) =>
    ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", "chat-abc")).collect(),
  );
  expect(calls2.length).toBe(1);
});

test("lookupKnowledge wrapper returns the contract shape", async () => {
  const t = convexTest(schema, modules);
  const businessId = await seedConfigured(t);
  const out = await t.query(api.chat.lookupKnowledge, {
    businessId: businessId as any,
    query: "hours",
  });
  expect(out).toHaveProperty("found");
  expect(Array.isArray(out.chunks)).toBe(true);
});
