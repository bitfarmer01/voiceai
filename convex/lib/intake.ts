/**
 * Service intake question sets — the closed-choice questions the receptionist asks
 * per service before offering slots. Pure and V8-safe: imported by Convex
 * mutations, the node ingest helpers, and (relatively) by lib/intake-script.ts.
 */
import type { IntakeQuestion, ServiceIntake } from "../_contracts";

export const MAX_QUESTIONS_PER_SERVICE = 3;
export const MAX_OPTIONS = 4;
export const MAX_OPTION_CHARS = 40;
export const MAX_PROMPT_CHARS = 160;

/** Asked for any service that has no (valid) set of its own. */
export const GENERIC_INTAKE: IntakeQuestion[] = [
  {
    id: "generic-1",
    prompt: "Is this your first visit, or have you been in before?",
    options: ["First visit", "Returning"],
  },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
}

function asRecord(x: unknown): Record<string, unknown> | null {
  // Narrowing an untyped LLM/JSON value; arrays are excluded explicitly.
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    if (typeof o !== "string") continue;
    const t = o.trim().slice(0, MAX_OPTION_CHARS);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

/**
 * Validate + clamp an untrusted intake payload against the business's services.
 * Keeps 1–3 questions per known service (2–4 options each); drops everything else.
 * Question ids are reassigned deterministically as `<service-slug>-<n>`.
 */
export function validateIntake(raw: unknown, services: string[]): ServiceIntake[] {
  if (!Array.isArray(raw)) return [];
  const canonical = new Map(services.map((s) => [s.trim().toLowerCase(), s]));
  const used = new Set<string>();
  const out: ServiceIntake[] = [];

  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec || typeof rec.service !== "string") continue;
    const key = rec.service.trim().toLowerCase();
    const service = canonical.get(key);
    if (!service || used.has(key)) continue;

    const questions: IntakeQuestion[] = [];
    for (const q of Array.isArray(rec.questions) ? rec.questions : []) {
      const qr = asRecord(q);
      if (!qr || typeof qr.prompt !== "string") continue;
      const prompt = qr.prompt.trim().slice(0, MAX_PROMPT_CHARS);
      const options = cleanOptions(qr.options);
      if (!prompt || options.length < 2) continue;
      questions.push({ id: `${slugify(service)}-${questions.length + 1}`, prompt, options });
      if (questions.length >= MAX_QUESTIONS_PER_SERVICE) break;
    }
    if (questions.length === 0) continue;

    used.add(key);
    out.push({ service, questions });
  }
  return out;
}

/** The question set for `service` (case-insensitive), else the generic set. */
export function intakeFor(intake: ServiceIntake[] | undefined, service: string): IntakeQuestion[] {
  const key = service.trim().toLowerCase();
  return intake?.find((s) => s.service.trim().toLowerCase() === key)?.questions ?? GENERIC_INTAKE;
}
