import { describe, expect, it } from "vitest";
import { buildChatTools } from "./tools";

describe("buildChatTools", () => {
  const tools = buildChatTools({ businessId: "biz_123", sessionId: "chat-1" });

  it("exposes the four expected tools", () => {
    expect(Object.keys(tools).sort()).toEqual(
      ["bookAppointment", "calculator", "checkAvailability", "lookupKnowledge"].sort(),
    );
  });

  it("calculator tool evaluates an expression in-process", async () => {
    const out = await (tools.calculator as any).execute({ expression: "3 * 49.99" });
    expect(out).toEqual({ result: 149.97 });
  });

  it("calculator tool returns an error object on bad input", async () => {
    const out = await (tools.calculator as any).execute({ expression: "2 +" });
    expect(out).toHaveProperty("error");
  });
});
