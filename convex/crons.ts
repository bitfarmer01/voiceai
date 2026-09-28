import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep every sample calendar rolling 14 days ahead; prune past sample rows.
crons.daily("roll sample calendars forward", { hourUTC: 0, minuteUTC: 5 }, internal.calendar.rollForward, {});

export default crons;
