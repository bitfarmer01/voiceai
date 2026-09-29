import { describe, expect, it } from "vitest";
import { GENERIC_INTAKE, intakeFor, validateIntake } from "./intake";

describe("validateIntake", () => {
  const services = ["Routine cleaning", "Whitening"];

  it("keeps valid sets, canonicalizes the service name, and assigns stable ids", () => {
    const out = validateIntake(
      [{ service: "  routine CLEANING ", questions: [{ prompt: "First visit?", options: ["Yes", "No"] }] }],
      services,
    );
    expect(out).toEqual([
      { service: "Routine cleaning", questions: [{ id: "routine-cleaning-1", prompt: "First visit?", options: ["Yes", "No"] }] },
    ]);
  });

  it("drops unknown services, duplicate services, and non-arrays", () => {
    expect(validateIntake("nope", services)).toEqual([]);
    const out = validateIntake(
      [
        { service: "Ghost", questions: [{ prompt: "?", options: ["a", "b"] }] },
        { service: "Whitening", questions: [{ prompt: "Kit?", options: ["In-office", "Take-home kit"] }] },
        { service: "whitening", questions: [{ prompt: "Again?", options: ["a", "b"] }] },
      ],
      services,
    );
    expect(out.map((s) => s.service)).toEqual(["Whitening"]);
    expect(out[0].questions[0].prompt).toBe("Kit?");
  });

  it("clamps: <=3 questions, 2..4 deduped options, options <=40 chars, prompt <=160 chars", () => {
    const long = "x".repeat(60);
    const out = validateIntake(
      [
        {
          service: "Whitening",
          questions: [
            { prompt: "one option only", options: ["a"] },
            { prompt: "p".repeat(200), options: ["a", "A", "b", "c", "d", "e"] },
            { prompt: "q3", options: [long, "short"] },
            { prompt: "q4", options: ["a", "b"] },
            { prompt: "q5", options: ["a", "b"] },
          ],
        },
      ],
      services,
    );
    const qs = out[0].questions;
    expect(qs).toHaveLength(3);
    expect(qs[0].prompt).toHaveLength(160);
    expect(qs[0].options).toEqual(["a", "b", "c", "d"]);
    expect(qs[1].options[0]).toHaveLength(40);
    expect(qs.map((q) => q.id)).toEqual(["whitening-1", "whitening-2", "whitening-3"]);
  });

  it("drops a service whose questions are all invalid", () => {
    expect(validateIntake([{ service: "Whitening", questions: [{ prompt: "", options: ["a", "b"] }] }], services)).toEqual([]);
  });
});

describe("intakeFor", () => {
  it("returns the service's set case-insensitively, else the generic set", () => {
    const intake = validateIntake([{ service: "Whitening", questions: [{ prompt: "Kit?", options: ["A", "B"] }] }], ["Whitening"]);
    expect(intakeFor(intake, "whitening")[0].prompt).toBe("Kit?");
    expect(intakeFor(intake, "Crowns")).toEqual(GENERIC_INTAKE);
    expect(intakeFor(undefined, "anything")).toEqual(GENERIC_INTAKE);
  });
});
