import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "./system-prompt";

describe("buildChatSystemPrompt", () => {
  const base = { businessName: "Glow Dental", knowledge: "Hours: Mon-Fri 9-5." };

  it("names the business and includes the knowledge as data", () => {
    const p = buildChatSystemPrompt(base);
    expect(p).toContain("Glow Dental");
    expect(p).toContain("Hours: Mon-Fri 9-5.");
  });
  it("instructs grounding via lookupKnowledge and check-before-book", () => {
    const p = buildChatSystemPrompt(base);
    expect(p).toContain("lookupKnowledge");
    expect(p).toContain("checkAvailability");
  });
  it("instructs calculator use for arithmetic", () => {
    expect(buildChatSystemPrompt(base).toLowerCase()).toContain("calculator");
  });
  it("appends caller context when present and omits it otherwise", () => {
    expect(buildChatSystemPrompt({ ...base, callerContext: "new patient" })).toContain("new patient");
    expect(buildChatSystemPrompt(base)).not.toContain("mentioned before starting");
  });
  it("includes the date anchor only when today is given", () => {
    expect(buildChatSystemPrompt({ ...base, today: "2026-06-21" })).toContain("2026-06-21");
    expect(buildChatSystemPrompt(base)).not.toContain("Today is");
  });
});
