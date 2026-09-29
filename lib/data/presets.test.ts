import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { validateIntake } from "../../convex/lib/intake";

describe("preset intake questions", () => {
  // The chat route re-validates intake; a preset that gets clamped or dropped
  // would silently read differently in chat than in voice.
  it.each(PRESETS.filter((p) => p.intakeQuestions).map((p) => [p.name, p] as const))(
    "%s survives validateIntake unchanged",
    (_name, preset) => {
      expect(validateIntake(preset.intakeQuestions, preset.services)).toEqual(preset.intakeQuestions);
    },
  );
});
