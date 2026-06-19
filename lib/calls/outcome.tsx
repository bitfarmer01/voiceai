import type * as React from "react";
import { CalendarCheck, ChatCircle, Question } from "@phosphor-icons/react";
import type { CallOutcome } from "@/lib/types";

/**
 * The ONE owner of "what a call outcome means, in plain language". Every
 * CallOutcome-keyed surface (the report header, the /calls feed, the admin log)
 * reads icon / colour / headline / summary from here, so the framing never forks.
 *
 * Owner words only — no provider names, no jargon, no cost. The report's wording is
 * canonical; the feed and admin inherit it.
 *
 * NOTE: the owner Overview's `recent-activity-list` keys on a DIFFERENT enum
 * (`result`: booked / messageLeft / noMessage) from a different backend query
 * (api.ownerStats.summary) at a different granularity. It intentionally does NOT
 * route through this map — see the comment there.
 */
export const CALL_OUTCOME: Record<
  CallOutcome,
  {
    icon: React.ElementType;
    /** Tailwind text-colour class for the icon. */
    iconClass: string;
    /** Short headline — what the call accomplished. */
    headline: string;
    /** One-line plain-English description of what the caller wanted. */
    summary: string;
  }
> = {
  booked: {
    icon: CalendarCheck,
    iconClass: "text-success",
    headline: "Booked an appointment",
    summary: "The caller wanted to schedule a visit.",
  },
  intent: {
    icon: ChatCircle,
    iconClass: "text-primary",
    headline: "Took a message",
    summary: "The caller wanted to get in touch and left their details.",
  },
  abandoned: {
    icon: Question,
    iconClass: "text-muted-foreground",
    headline: "Answered a question",
    summary: "The caller asked about the business.",
  },
};
