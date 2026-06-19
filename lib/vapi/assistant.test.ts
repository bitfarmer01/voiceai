import { describe, it, expect } from "vitest";
import {
  buildAssistant,
  buildAssistantFromConvexBusiness,
  DEFAULT_PIPELINE,
  type ConvexBusinessForAssistant,
} from "./assistant";
import { PRESETS } from "../data/presets";

const preset = PRESETS[0]; // Glow Dental

/** Pull the system message content out of a built assistant. */
function systemContent(assistant: ReturnType<typeof buildAssistant>): string {
  const messages = assistant.model.messages as { role: string; content: string }[];
  const sys = messages.find((m) => m.role === "system");
  if (!sys) throw new Error("no system message");
  return sys.content;
}

const convexBiz: ConvexBusinessForAssistant = {
  _id: "biz_123",
  name: "Acme Plumbing",
  profile: {
    companyName: "Acme Plumbing Co.",
    hours: "Mon–Fri 9am–5pm",
    services: ["Drain cleaning", "Leak repair"],
    policies: ["48h cancellation"],
    availability: "By appointment",
  },
  chunks: [{ text: "We service the whole metro area." }],
};

describe("buildAssistant — preset", () => {
  it("uses temperature 0.2 (openai branch)", () => {
    const a = buildAssistant(preset, DEFAULT_PIPELINE);
    expect((a.model as { temperature: number }).temperature).toBe(0.2);
  });

  it("uses temperature 0.2 on the groq branch", () => {
    const a = buildAssistant(preset, { ...DEFAULT_PIPELINE, llmId: "groq-llama" });
    expect((a.model as { temperature: number }).temperature).toBe(0.2);
  });

  it("includes the check-availability-before-book rule", () => {
    const s = systemContent(buildAssistant(preset, DEFAULT_PIPELINE));
    expect(s).toMatch(/before booking, call check_availability/i);
    expect(s).toMatch(/only the slots it returns/i);
  });

  it("instructs lookup_knowledge grounding for uncovered questions", () => {
    const s = systemContent(buildAssistant(preset, DEFAULT_PIPELINE));
    expect(s).toMatch(/call lookup_knowledge first/i);
    expect(s).toMatch(/take a message/i);
  });

  it("has a scoped refusal naming the business", () => {
    const s = systemContent(buildAssistant(preset, DEFAULT_PIPELINE));
    expect(s).toMatch(/you only help with/i);
    expect(s).toContain(preset.name);
    expect(s).toMatch(/outside what you can help with/i);
  });

  it("injects the date anchor line only when today is passed", () => {
    const without = systemContent(buildAssistant(preset, DEFAULT_PIPELINE));
    expect(without).not.toMatch(/Today is/);

    const withDate = systemContent(
      buildAssistant(preset, DEFAULT_PIPELINE, { today: "Thursday, June 18, 2026" }),
    );
    expect(withDate).toContain("Today is Thursday, June 18, 2026.");
    expect(withDate).toMatch(/resolve relative dates/i);
  });

  it("keeps the end-call instruction (unchanged behavior)", () => {
    const s = systemContent(buildAssistant(preset, DEFAULT_PIPELINE));
    expect(s).toMatch(/end call tool to hang up/i);
  });
});

describe("buildAssistantFromConvexBusiness — BYOD", () => {
  it("uses temperature 0.2", () => {
    const a = buildAssistantFromConvexBusiness(convexBiz, DEFAULT_PIPELINE);
    expect((a.model as { temperature: number }).temperature).toBe(0.2);
  });

  it("includes all four prompt invariants and the date anchor", () => {
    const s = systemContent(
      buildAssistantFromConvexBusiness(convexBiz, DEFAULT_PIPELINE, {
        today: "Thursday, June 18, 2026",
      }),
    );
    expect(s).toMatch(/before booking, call check_availability/i);
    expect(s).toMatch(/call lookup_knowledge first/i);
    expect(s).toMatch(/you only help with/i);
    expect(s).toContain(convexBiz.name);
    expect(s).toContain("Today is Thursday, June 18, 2026.");
  });

  it("omits the date anchor when today is not provided", () => {
    const s = systemContent(buildAssistantFromConvexBusiness(convexBiz, DEFAULT_PIPELINE));
    expect(s).not.toMatch(/Today is/);
  });
});
