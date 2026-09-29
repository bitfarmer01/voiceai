/**
 * The receptionist's booking script — shared by the voice (VAPI) and chat system
 * prompts so both channels run the identical closed-question flow toward a
 * confirmed appointment. Pure; relative imports because tests import this file.
 */
import { intakeFor } from "../convex/lib/intake";
import { parseHours } from "../convex/lib/hours";
import type { ServiceIntake } from "./types";

export type IntakeToolNames = { lookup: string; availability: string; book: string };

export const VOICE_TOOLS: IntakeToolNames = {
  lookup: "lookup_knowledge",
  availability: "check_availability",
  book: "book_appointment",
};

export const CHAT_TOOLS: IntakeToolNames = {
  lookup: "lookupKnowledge",
  availability: "checkAvailability",
  book: "bookAppointment",
};

function joinChoices(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/** Lower-case the first letter for mid-sentence use, but leave acronyms ("A1", "PPO") alone. */
function lowerFirst(s: string): string {
  return /^[A-Z][A-Z0-9]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

/** The first thing the receptionist says: a closed "which service?" question. */
export function buildOpener(companyName: string, services: string[], channel: "voice" | "chat"): string {
  const hello = channel === "voice" ? `Thanks for calling ${companyName}!` : `Hi, welcome to ${companyName}!`;
  if (services.length === 0) return `${hello} Would you like to book an appointment today?`;
  const named = services.slice(0, 3).map(lowerFirst);
  const list = services.length > 3 ? joinChoices([...named, "something else"]) : joinChoices(named);
  return `${hello} Are you booking ${list} today?`;
}

/** Parts of the day the business is actually open, for the "Morning or afternoon?" question. */
export function partsOfDay(hours: string): string[] {
  const schedule = parseHours(hours);
  if (!schedule) return ["Morning", "Afternoon"];
  const days = Object.values(schedule).filter(
    (d): d is { openMin: number; closeMin: number } => d != null,
  );
  const parts: string[] = [];
  if (days.some((d) => d.openMin < 12 * 60)) parts.push("Morning");
  if (days.some((d) => d.closeMin > 12 * 60 && d.openMin < 17 * 60)) parts.push("Afternoon");
  if (days.some((d) => d.closeMin > 17 * 60 + 30)) parts.push("Evening");
  return parts.length > 0 ? parts : ["Morning", "Afternoon"];
}

function questionLines(questions: { prompt: string; options: string[] }[]): string[] {
  return questions.map((q, i) => `     ${i + 1}. "${q.prompt}" (${q.options.join(" / ")})`);
}

/** The step-by-step booking flow, rendered as prompt text. */
export function buildIntakeScript(input: {
  services: string[];
  hours: string;
  intakeQuestions?: ServiceIntake[];
  tools: IntakeToolNames;
}): string {
  const { services, tools } = input;
  const perService = services.flatMap((s) => [`   - ${s}:`, ...questionLines(intakeFor(input.intakeQuestions, s))]);
  const parts = partsOfDay(input.hours);

  return [
    `BOOKING FLOW — your goal in every conversation is a confirmed appointment.`,
    `Ask exactly ONE question per turn, and every question must offer explicit choices. Never ask open-ended questions such as "How can I help?", "What can I do for you?", or "Anything else?".`,
    `1. Service — if the customer hasn't chosen one, ask which they want: ${services.length > 0 ? joinChoices(services) : "offer the services listed in the business information"}.`,
    `2. Service questions — ask these in order, reading the choices exactly as written:`,
    ...perService,
    `   - Any other service:`,
    ...questionLines(intakeFor(undefined, "")),
    `   If an answer doesn't match a choice, repeat the choices once, then move on.`,
    `3. Time — ask "${joinChoices(parts)}?", then call ${tools.availability} with the soonest sensible date (YYYY-MM-DD) and preferredTime set to their answer. Offer exactly the slots it returns as a choice: "I have <first> or <second> — which works?". Say times naturally (e.g. "Tuesday at 10am").`,
    `4. Details — ask for their name, then a phone number or email.`,
    `5. Confirm — read back the service, day, time, name, and contact and ask "Shall I book that?" (Yes / No). On yes, call ${tools.book} with the slot exactly as ${tools.availability} returned it, and put each service answer in notes as "Question: Answer" lines. If it says the time is taken, offer the two alternatives it gives.`,
    `6. Side questions — if the customer asks something factual, call ${tools.lookup}, answer in one sentence, then return to the next unanswered step with a yes/no or either/or question such as "Want me to get that booked?".`,
    `7. Only take a message if the customer declines to book twice, or ${tools.availability} finds no open time.`,
  ].join("\n");
}
