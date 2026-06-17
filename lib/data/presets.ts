import type { BusinessProfile } from "@/lib/types";

/** A preset business + the knowledge the receptionist is grounded in (injected as data). */
export interface PresetBusiness extends BusinessProfile {
  greeting: string;
  knowledge: string; // FAQ/policy text, sandboxed as data in the system prompt
}

export const PRESETS: PresetBusiness[] = [
  {
    id: "glow-dental",
    name: "Glow Dental",
    kind: "preset",
    hours: "Mon–Fri 8am–5pm, Sat 9am–1pm, closed Sunday",
    services: ["Routine cleaning", "Whitening", "Fillings", "Crowns", "Emergency visits"],
    policies: ["New patients welcome", "24h cancellation notice", "Most PPO insurance accepted"],
    chunkCount: 12,
    greeting: "Thanks for calling Glow Dental! How can I help you today?",
    knowledge:
      "Glow Dental is a family dental clinic. Hours: Mon–Fri 8am–5pm, Sat 9am–1pm, closed Sunday. " +
      "Services: routine cleaning ($120), teeth whitening ($299), fillings, crowns, and emergency visits. " +
      "New patients are welcome; first visit includes an exam and x-rays. Cancellations require 24 hours notice. " +
      "We accept most PPO insurance. Parking is free behind the building.",
  },
  {
    id: "lux-salon",
    name: "Lux Salon",
    kind: "preset",
    hours: "Tue–Sat 10am–7pm, closed Sun & Mon",
    services: ["Haircut", "Color", "Balayage", "Blowout", "Bridal styling"],
    policies: ["Deposit required for color services", "48h cancellation notice", "Walk-ins when available"],
    chunkCount: 9,
    greeting: "Hi, thanks for calling Lux Salon! What can I do for you?",
    knowledge:
      "Lux Salon is a hair salon. Hours: Tue–Sat 10am–7pm, closed Sunday and Monday. " +
      "Services: women's and men's haircuts (from $55), color (from $120), balayage (from $180), " +
      "blowouts ($45), and bridal styling by appointment. Color services require a deposit. " +
      "Cancellations need 48 hours notice. Walk-ins accepted when a stylist is available.",
  },
  {
    id: "hale-park-law",
    name: "Hale & Park Law",
    kind: "preset",
    hours: "Mon–Fri 9am–6pm by appointment",
    services: ["Estate planning", "Family law", "Small-business formation", "Free 15-min consult"],
    policies: ["Consultations by appointment only", "Conflict check before booking", "No legal advice over the phone"],
    chunkCount: 14,
    greeting: "Hello, you've reached Hale & Park Law. How can I help?",
    knowledge:
      "Hale & Park Law is a boutique law firm. Hours: Mon–Fri 9am–6pm, by appointment only. " +
      "Practice areas: estate planning, family law, and small-business formation. " +
      "We offer a free 15-minute initial consultation. We must run a conflict check before booking. " +
      "The receptionist does not give legal advice over the phone — it only schedules consultations and takes intake details.",
  },
];

export function getPreset(id: string): PresetBusiness | undefined {
  return PRESETS.find((p) => p.id === id);
}
