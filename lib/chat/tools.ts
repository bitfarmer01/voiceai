/**
 * AI SDK tool definitions for the text twin, built PER REQUEST so the
 * Convex-backed tools close over the active {businessId, sessionId} (the model
 * never chooses which business it is). The calculator runs in-process; the
 * other three delegate to the public Convex wrappers (convex/chat.ts) via a
 * ConvexHttpClient. The booking tool returns a ready-to-render Booking.
 */
import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
// Relative import required: vitest has no @/ alias, and this file is imported by tests.
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Booking } from "../types";
import { evaluateExpression } from "./calculator";

function convex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export function buildChatTools(ctx: { businessId: string; sessionId: string }) {
  const businessId = ctx.businessId as Id<"businesses">;

  // One ConvexHttpClient per request, created lazily on the first Convex-backed
  // tool call — so the calculator-only path (and the env-free unit test) never
  // constructs one, and a multi-tool turn reuses a single client.
  let httpClient: ConvexHttpClient | null = null;
  const client = () => (httpClient ??= convex());

  return {
    calculator: tool({
      description:
        "Evaluate an arithmetic expression. Use for ANY math: totals, durations, discounts, splitting bills. Input is a plain expression like '3 * 49.99' or '(120 + 30) / 2'.",
      inputSchema: z.object({
        expression: z.string().describe("A plain arithmetic expression, e.g. '3 * 49.99'"),
      }),
      execute: async ({ expression }) => evaluateExpression(expression),
    }),

    lookupKnowledge: tool({
      description:
        "Search this business's knowledge base (hours, services, policies, pricing, location) and return matching source text.",
      inputSchema: z.object({
        query: z.string().describe("What the customer asked about"),
      }),
      execute: async ({ query }) =>
        client().query(api.chat.lookupKnowledge, { businessId, query }),
    }),

    checkAvailability: tool({
      description:
        "Check available appointment slots for a given date. Call this before booking; only offer the slots it returns.",
      inputSchema: z.object({
        date: z.string().describe("The date the customer wants, as YYYY-MM-DD"),
        preferredTime: z.string().optional().describe("Optional time hint, e.g. 'morning' or '14:00'"),
        service: z.string().optional().describe("Optional requested service"),
      }),
      execute: async ({ date, preferredTime, service }) =>
        client().query(api.chat.checkAvailability, { businessId, date, preferredTime, service }),
    }),

    bookAppointment: tool({
      description:
        "Book an appointment after confirming an available slot. Collect the customer's name and a contact (phone or email) first.",
      inputSchema: z.object({
        slot: z.string().describe("The chosen slot, ISO datetime or 'YYYY-MM-DD HH:mm'"),
        customerName: z.string(),
        contact: z.string().describe("Phone or email for the confirmation"),
        service: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ slot, customerName, contact, service, notes }) => {
        const res = await client().mutation(api.chat.bookAppointment, {
          businessId,
          sessionId: ctx.sessionId,
          slot,
          customerName,
          contact,
          service,
          notes,
        });
        const booking: Booking | null = res.booked
          ? {
              confirmationId: res.confirmationId,
              slot: res.slot,
              customerName,
              contact,
              service: service ?? null,
              notes: notes ?? null,
              bookedAt: Date.now(),
            }
          : null;
        return { booked: res.booked, message: res.message, booking };
      },
    }),
  };
}
