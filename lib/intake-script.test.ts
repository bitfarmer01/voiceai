import { describe, expect, it } from "vitest";
import { buildIntakeScript, buildOpener, CHAT_TOOLS, partsOfDay, VOICE_TOOLS } from "./intake-script";

describe("buildOpener", () => {
  it("asks a closed service question for up to three services", () => {
    expect(buildOpener("Glow Dental", ["Cleaning", "Whitening", "Checkup"], "voice")).toBe(
      "Thanks for calling Glow Dental! Are you booking cleaning, whitening, or checkup today?",
    );
  });
  it("names the first three and adds 'something else' beyond three", () => {
    expect(buildOpener("Glow", ["A1", "Bb", "Cc", "Dd"], "chat")).toBe(
      "Hi, welcome to Glow! Are you booking A1, bb, cc, or something else today?",
    );
  });
  it("still asks a yes/no when there are no services", () => {
    expect(buildOpener("Glow", [], "voice")).toBe("Thanks for calling Glow! Would you like to book an appointment today?");
  });
  it("never asks 'How can I help'", () => {
    expect(buildOpener("Glow", ["Cut"], "voice")).not.toMatch(/how can i help/i);
  });
});

describe("partsOfDay", () => {
  it("offers only the parts of the day the business is open", () => {
    expect(partsOfDay("Mon–Fri 8am–5pm")).toEqual(["Morning", "Afternoon"]);
    expect(partsOfDay("Tue–Sat 10am–7pm")).toEqual(["Morning", "Afternoon", "Evening"]);
    expect(partsOfDay("Mon–Fri 1pm–5pm")).toEqual(["Afternoon"]);
    expect(partsOfDay("call us")).toEqual(["Morning", "Afternoon"]);
  });
});

describe("buildIntakeScript", () => {
  const intake = [{ service: "Whitening", questions: [{ id: "w-1", prompt: "In-office or a take-home kit?", options: ["In-office", "Take-home kit"] }] }];

  it("lists each service's questions with their choices, plus the generic fallback", () => {
    const s = buildIntakeScript({ services: ["Whitening", "Crowns"], hours: "Mon–Fri 8am–5pm", intakeQuestions: intake, tools: CHAT_TOOLS });
    expect(s).toContain('"In-office or a take-home kit?" (In-office / Take-home kit)');
    expect(s).toContain("- Crowns:");
    expect(s).toContain('"Is this your first visit, or have you been in before?" (First visit / Returning)');
    expect(s).toContain("Morning or Afternoon?");
  });

  it("uses the channel's tool names and forbids open-ended questions", () => {
    const voice = buildIntakeScript({ services: [], hours: "", tools: VOICE_TOOLS });
    expect(voice).toContain("check_availability");
    expect(voice).toContain("book_appointment");
    expect(voice).toMatch(/Never ask open-ended questions/);
    const chat = buildIntakeScript({ services: [], hours: "", tools: CHAT_TOOLS });
    expect(chat).toContain("checkAvailability");
    expect(chat).toContain("bookAppointment");
  });
});
