import type { BusinessProfile, ServiceDetail } from "@/lib/types";

/** A preset business + the knowledge the receptionist is grounded in (injected as data). */
export interface PresetBusiness extends BusinessProfile {
  greeting: string;
  /** How the demo entry card describes the business, e.g. "a dental clinic". */
  kindLabel: string;
  knowledge: string; // FAQ/policy text, sandboxed as data in the system prompt
  /** Structured service list with optional pricing, for the reference panel. */
  serviceDetails?: ServiceDetail[];
}

export const PRESETS: PresetBusiness[] = [
  {
    id: "glow-dental",
    name: "Glow Dental",
    kindLabel: "a dental clinic",
    kind: "preset",
    hours: "Mon–Fri 8am–5pm, Sat 9am–1pm, closed Sunday",
    services: ["Routine cleaning", "Whitening", "Fillings", "Crowns", "Emergency visits"],
    policies: ["New patients welcome", "24h cancellation notice", "Most PPO insurance accepted"],
    intakeQuestions: [
      { service: "Routine cleaning", questions: [
        { id: "routine-cleaning-1", prompt: "Is this your first visit with us?", options: ["First visit", "Returning"] },
        { id: "routine-cleaning-2", prompt: "Would you like us to bill dental insurance?", options: ["Yes", "No"] },
      ] },
      { service: "Whitening", questions: [
        { id: "whitening-1", prompt: "Have you had professional whitening before?", options: ["Yes", "No"] },
        { id: "whitening-2", prompt: "In-office or a take-home kit?", options: ["In-office", "Take-home kit"] },
      ] },
      { service: "Fillings", questions: [
        { id: "fillings-1", prompt: "Is the tooth painful right now?", options: ["Yes", "No"] },
        { id: "fillings-2", prompt: "Is this your first visit with us?", options: ["First visit", "Returning"] },
      ] },
      { service: "Crowns", questions: [
        { id: "crowns-1", prompt: "Is this a new crown or a replacement?", options: ["New crown", "Replacement"] },
        { id: "crowns-2", prompt: "Is the tooth painful right now?", options: ["Yes", "No"] },
      ] },
      { service: "Emergency visits", questions: [
        { id: "emergency-visits-1", prompt: "Which best describes it?", options: ["Severe pain", "Broken or chipped tooth", "Swelling", "Lost filling or crown"] },
        { id: "emergency-visits-2", prompt: "Is this your first visit with us?", options: ["First visit", "Returning"] },
      ] },
    ],
    chunkCount: 12,
    serviceDetails: [
      { name: "Routine cleaning", price: "$120" },
      { name: "Whitening",        price: "$299" },
      { name: "Fillings" },
      { name: "Crowns" },
      { name: "Emergency visits" },
    ],
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
    kindLabel: "a hair salon",
    kind: "preset",
    hours: "Tue–Sat 10am–7pm, closed Sun & Mon",
    services: ["Haircut", "Color", "Balayage", "Blowout", "Bridal styling"],
    policies: ["Deposit required for color services", "48h cancellation notice", "Walk-ins when available"],
    chunkCount: 9,
    serviceDetails: [
      { name: "Haircut",         price: "from $55" },
      { name: "Color",           price: "from $120" },
      { name: "Balayage",        price: "from $180" },
      { name: "Blowout",         price: "$45" },
      { name: "Bridal styling" },
    ],
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
    kindLabel: "a law firm",
    kind: "preset",
    hours: "Mon–Fri 9am–6pm by appointment",
    services: ["Estate planning", "Family law", "Small-business formation", "Free 15-min consult"],
    policies: ["Consultations by appointment only", "Conflict check before booking", "No legal advice over the phone"],
    chunkCount: 14,
    serviceDetails: [
      { name: "Estate planning" },
      { name: "Family law" },
      { name: "Small-business formation" },
      { name: "Initial consultation", price: "Free (15 min)" },
    ],
    greeting: "Hello, you've reached Hale & Park Law. How can I help?",
    knowledge:
      "Hale & Park Law is a boutique law firm. Hours: Mon–Fri 9am–6pm, by appointment only. " +
      "Practice areas: estate planning, family law, and small-business formation. " +
      "We offer a free 15-minute initial consultation. We must run a conflict check before booking. " +
      "The receptionist does not give legal advice over the phone — it only schedules consultations and takes intake details.",
  },
  {
    // Client: affordablehealthcareofcentralfl.com (Samuel Gordon, independent agent).
    // Office hours aren't published on the site — the hours below are a placeholder
    // to confirm with the client before a live demo.
    id: "affordable-health-cfl",
    name: "Affordable Health Insurance of Central Florida",
    kindLabel: "an insurance agency",
    kind: "preset",
    hours: "Mon–Fri 9am–5pm, closed Sat & Sun",
    services: ["Medicare", "Health insurance", "Life insurance", "Small business plans"],
    policies: [
      "Consultations are always free — Samuel is paid by the carriers",
      "Receptionist books consultations only; no plan advice or premium quotes by phone",
      "Serving Orlando and Central Florida",
    ],
    intakeQuestions: [
      { service: "Medicare", questions: [
        { id: "medicare-1", prompt: "Happy to help with that. Are you new to Medicare, or reviewing a plan you already have?", options: ["New to Medicare", "Reviewing my plan"] },
        { id: "medicare-2", prompt: "Some plans are built for people who have both, so Samuel likes to know. Do you also have Medicaid? Not sure is fine too.", options: ["Yes", "No", "Not sure"] },
      ] },
      { service: "Health insurance", questions: [
        { id: "health-insurance-1", prompt: "Sure thing. Is the coverage just for you, or for your family too?", options: ["Just me", "My family"] },
        { id: "health-insurance-2", prompt: "Timing can matter for enrollment. Do you have coverage right now, no coverage, or are you losing it soon?", options: ["Have coverage", "No coverage", "Losing it soon"] },
      ] },
      { service: "Life insurance", questions: [
        { id: "life-insurance-1", prompt: "Great. No need to know plan types, Samuel walks you through that. Is this your first policy, or are you reviewing one you have?", options: ["First policy", "Reviewing one I have"] },
      ] },
      { service: "Small business plans", questions: [
        { id: "small-business-plans-1", prompt: "Smaller employers may qualify for a tax credit, so it helps to know. About how many employees do you have: fewer than 25, 25 to 50, or more?", options: ["Fewer than 25", "25 to 50", "More than 50"] },
        { id: "small-business-plans-2", prompt: "And do you offer health coverage to them today?", options: ["Yes", "No"] },
      ] },
    ],
    chunkCount: 10,
    serviceDetails: [
      { name: "Medicare",             price: "Free" },
      { name: "Health insurance",     price: "Free" },
      { name: "Life insurance",       price: "Free" },
      { name: "Small business plans", price: "Free" },
    ],
    greeting: "Thanks for calling Affordable Health Insurance of Central Florida! How can I help?",
    knowledge:
      "Affordable Health Insurance of Central Florida is an independent health, Medicare, and life insurance agency run by " +
      "Samuel Gordon, a licensed Florida insurance agent (NPN 17189418) with over 14 years of experience. Phone: (407) 900-8015. " +
      "Hours: Mon–Fri 9am–5pm, closed Saturday and Sunday. " +
      "Consultations are always free — Samuel is paid by the insurance carriers, never by the client. " +
      "As an independent agent he compares plans from many Florida carriers. " +
      "Services: Medicare Advantage, Medicare Supplement (Medigap), Part D drug plans, help for people with both Medicare and Medicaid, " +
      "ACA Marketplace plans for individuals and families, term and whole life insurance, and small business (SHOP) group coverage, " +
      "where small employers may qualify for a federal tax credit of up to half their premium. " +
      "Medicare Annual Enrollment runs October 15 to December 7; your Initial Enrollment Period starts 3 months before you turn 65. " +
      "ACA Open Enrollment runs November 1 to January 15; a job loss, marriage, or new baby may qualify you for a Special Enrollment Period. " +
      "Most clients are quoted the same day. Service area: Orlando, Kissimmee, Sanford, Deltona, The Villages, Winter Park, " +
      "Daytona Beach, Ocala, Lakeland, and Altamonte Springs. " +
      "Not connected with or endorsed by the U.S. government or the federal Medicare program. " +
      "The receptionist does not recommend plans, quote premiums, or confirm whether a doctor or prescription is covered — " +
      "it books a free consultation where Samuel reviews all of that. " +
      "For every service, the next step is a free consultation with Samuel. He compares plans from many Florida carriers, " +
      "reviews costs and coverage with you, and most clients are quoted the same day. " +
      "Callers don't need to know which plan or type of policy they want before booking; Samuel explains the options at the consultation. " +
      "The receptionist can't quote premiums or recommend plans, but can book the free consultation where Samuel covers that.",
  },
];

export function getPreset(id: string): PresetBusiness | undefined {
  return PRESETS.find((p) => p.id === id);
}
