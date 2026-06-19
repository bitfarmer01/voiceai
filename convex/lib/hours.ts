/**
 * Structured business-hours model — convex/lib/hours.ts
 *
 * Pure, V8-safe (no imports outside convex/, no node deps, no IO, no clock at
 * module scope). Parses the free-text weekly hours stored on
 * `business.profile.hours` into a structured weekly schedule, then validates
 * booking requests against it.
 *
 * ROOT-CAUSE THIS FIXES: hours were free text and never parsed, so
 * check_availability returned fixed fictional slots (only Sunday hardcoded
 * closed) and book_appointment validated nothing — it would book a closed day,
 * a past date, or a time outside the open window verbatim.
 *
 * DESIGN — graceful degradation: every parse path returns `null`/`undefined`
 * (NEVER throws) when the text can't be confidently understood. Callers treat a
 * null schedule as "couldn't verify" and degrade-open with a transparent note
 * rather than hard-blocking a real booking. We aim to parse the common/preset
 * cases correctly and never make BYOD worse than the old "always open except
 * Sunday" behaviour.
 *
 * Handles, concretely:
 *   - day RANGES: "Mon–Fri" / "Mon-Fri" / "Monday to Friday" (en-dash, hyphen, "to")
 *   - single days: "Sat", "Saturday"
 *   - explicit closures: "closed Sunday", "closed Sun & Mon", "closed Sat and Sun"
 *   - times in 12h ("8am", "8:30am", "5pm") and 24h ("8:00", "17:00")
 *   - trailing modalities ("by appointment") — ignored, NOT treated as a closure
 *   - multiple comma-separated clauses ("Mon–Fri 8am–5pm, Sat 9am–1pm, closed Sunday")
 */

/** A single day's open window. Minutes-from-midnight. `null` = closed that day. */
export type DayHours = { openMin: number; closeMin: number } | null;

/** Weekly schedule keyed by day-of-week 0..6 (0 = Sunday, JS getUTCDay order). */
export type WeeklySchedule = Record<number, DayHours>;

/** Options for slot generation. */
export type SlotOptions = {
  /** Slot granularity in minutes (default 30 → on the hour and half-hour). */
  stepMin?: number;
  /** Cap on how many slots to return (default 4). */
  max?: number;
  /**
   * Don't start a slot later than this many minutes BEFORE close (default 0).
   * Lets a caller reserve service time; 0 = up to (but not including) close.
   */
  lastBeforeCloseMin?: number;
};

// ── day-name → index (0 = Sunday) ────────────────────────────────────────────
const DAY_INDEX: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Pretty day name for owner/caller-facing notes (plain language). */
const DAY_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Normalize all dash variants (en/em-dash, hyphen) and whitespace. */
function normalizeDashes(text: string): string {
  return text.replace(/[–—]/g, "-");
}

function dayIndexOf(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\./g, "");
  return key in DAY_INDEX ? DAY_INDEX[key] : null;
}

/**
 * Parse a single time token ("8am", "8:30am", "5pm", "8:00", "17:00") into
 * minutes-from-midnight, or null if it isn't a recognizable time.
 */
export function parseTimeToken(raw: string): number | null {
  const token = raw.trim().toLowerCase();
  // 12h with am/pm — hour, optional :minutes, am/pm.
  const ampm = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const mer = ampm[3];
    if (hour < 1 || hour > 12 || min > 59) return null;
    if (mer === "am") {
      if (hour === 12) hour = 0; // 12am = midnight
    } else {
      if (hour !== 12) hour += 12; // 12pm = noon stays 12
    }
    return hour * 60 + min;
  }
  // 24h "HH:mm" (or "H:mm").
  const h24 = token.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const hour = parseInt(h24[1], 10);
    const min = parseInt(h24[2], 10);
    if (hour > 23 || min > 59) return null;
    return hour * 60 + min;
  }
  return null;
}

/**
 * Parse a time RANGE like "8am-5pm", "10:00-19:00", "9am - 1pm".
 * Inputs are expected dash-normalized. Returns {openMin, closeMin} or null.
 *
 * When only ONE side carries a meridiem ("8-5pm"), infer the missing side's
 * meridiem from the resolved range (e.g. "8" + "5pm" → 8am-5pm) so common
 * shorthand parses. If the inference yields a non-increasing window, bail.
 */
function parseTimeRange(raw: string): { openMin: number; closeMin: number } | null {
  const m = raw.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (!m) return null;
  const left = m[1].trim();
  const right = m[2].trim();

  let openMin = parseTimeToken(left);
  let closeMin = parseTimeToken(right);

  const leftHasMer = /am|pm/i.test(left);
  const rightHasMer = /am|pm/i.test(right);

  // Shorthand "8-5pm": left lacks meridiem, right has it.
  if (openMin === null && !leftHasMer && rightHasMer && closeMin !== null) {
    // Try as a bare hour and pick the meridiem that yields open < close.
    const bare = parseTimeToken(`${left}am`);
    const barePm = parseTimeToken(`${left}pm`);
    if (bare !== null && bare < closeMin) openMin = bare;
    else if (barePm !== null && barePm < closeMin) openMin = barePm;
  }
  // Shorthand "8am-5": left has meridiem, right lacks it.
  if (closeMin === null && !rightHasMer && leftHasMer && openMin !== null) {
    const bareAm = parseTimeToken(`${right}am`);
    const barePm = parseTimeToken(`${right}pm`);
    if (barePm !== null && barePm > openMin) closeMin = barePm;
    else if (bareAm !== null && bareAm > openMin) closeMin = bareAm;
  }

  if (openMin === null || closeMin === null) return null;
  if (closeMin <= openMin) return null; // empty or inverted window
  return { openMin, closeMin };
}

/**
 * Expand a day spec into the list of day indices it covers. Handles ranges
 * ("mon-fri", "monday to friday"), lists ("mon and wed", "sat & sun"), single
 * days ("sat"), and tolerates stray words ("open monday to friday"). Unknown
 * tokens are ignored rather than failing the whole spec. Returns null when no
 * day is recognized.
 */
function expandDaySpec(spec: string): number[] | null {
  const normalized = spec
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\bto\b/g, "-") // "monday to friday" → "monday - friday"
    .replace(/&/g, " and ");
  // Sub-specs separated by "and" or commas; each is a range or a single day.
  const parts = normalized
    .split(/\s*(?:\band\b|,)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const days = new Set<number>();
  for (const part of parts) {
    const range = part.match(/([a-z.]+)\s*-\s*([a-z.]+)/);
    if (range) {
      const start = dayIndexOf(range[1]);
      const end = dayIndexOf(range[2]);
      if (start !== null && end !== null) {
        // Walk forward (mod 7) so "Sat-Mon" wraps if it ever appears.
        let d = start;
        for (let i = 0; i < 7; i++) {
          days.add(d);
          if (d === end) break;
          d = (d + 1) % 7;
        }
        continue;
      }
    }
    // Not a clean range — scan for any single day tokens ("open monday").
    for (const tok of part.split(/\s+/)) {
      const idx = dayIndexOf(tok);
      if (idx !== null) days.add(idx);
    }
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
}

/**
 * Parse free-text weekly hours into a {0..6 -> DayHours} schedule.
 * Returns `null` when nothing parseable is found (degrade path) — NEVER throws.
 *
 * Strategy: split on commas into clauses. Each clause is either
 *   - a "closed <days>" clause, or
 *   - a "<day-spec> <time-range>" clause.
 * Days mentioned with hours are open on those hours; days named in a "closed"
 * clause are explicitly closed; any day never mentioned stays closed (null).
 */
export function parseHours(text: string | null | undefined): WeeklySchedule | null {
  if (typeof text !== "string" || text.trim() === "") return null;

  // ── Always-open phrasings → open every day, all day.
  if (/\b24\s*\/\s*7\b|24\s*hours|always open|open 24\b/i.test(text)) {
    const allDay = (): DayHours => ({ openMin: 0, closeMin: 24 * 60 });
    return { 0: allDay(), 1: allDay(), 2: allDay(), 3: allDay(), 4: allDay(), 5: allDay(), 6: allDay() };
  }

  const schedule: WeeklySchedule = {
    0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null,
  };
  let matchedAnything = false;
  // Day-only clauses (no time in the clause) buffer here to inherit the next
  // clause's hours — e.g. "Mon, Wed, Fri 9am–5pm". Cleared by any closure or
  // once a time range consumes them.
  let pendingDays: number[] = [];

  const normalized = normalizeDashes(text);
  // Split on commas and semicolons into independent clauses.
  const clauses = normalized.split(/[,;]+/);

  for (const rawClause of clauses) {
    const clause = rawClause.trim();
    if (clause === "") continue;

    // ── "closed <days>" — "closed Sunday", "closed Sun & Mon", "closed Sat and Sun"
    const closedMatch = clause.match(/closed\s+(.+)$/i);
    if (closedMatch && !/\d/.test(clause)) {
      const dayList = closedMatch[1]
        .split(/\s*(?:&|and|,)\s*/i)
        .map((d) => d.trim())
        .filter(Boolean);
      for (const dayTok of dayList) {
        const idx = dayIndexOf(dayTok);
        if (idx !== null) {
          schedule[idx] = null; // explicit closure
          matchedAnything = true;
        }
      }
      pendingDays = []; // a closure clause ends any buffered open-day context
      continue;
    }

    // ── "<day-spec> <time-range> [modality]" ─────────────────────────────────
    // Split at the first digit: the day portion precedes any time range.
    const firstDigit = clause.search(/\d/);
    const dayPart = (firstDigit > 0 ? clause.slice(0, firstDigit) : firstDigit < 0 ? clause : "").trim();
    const days = dayPart ? expandDaySpec(dayPart) : null;
    const remainder = firstDigit >= 0 ? clause.slice(firstDigit) : "";
    const range = remainder ? parseTimeRange(remainder) : null;

    if (range) {
      // Apply to this clause's days PLUS any buffered day-only clauses.
      const applyTo = new Set<number>([...(days ?? []), ...pendingDays]);
      for (const d of applyTo) {
        schedule[d] = { openMin: range.openMin, closeMin: range.closeMin };
        matchedAnything = true;
      }
      pendingDays = [];
    } else if (days) {
      // Day(s) named with no parseable hours in THIS clause. Could be a list
      // member awaiting hours ("Mon, Wed, Fri 9–5") or a modality-only line
      // ("Mon–Fri by appointment"). Buffer them; if no time ever arrives they
      // stay null (default closed) and the whole text degrades-open.
      pendingDays.push(...days);
    }
  }

  if (!matchedAnything) return null;

  // If we matched ONLY "closed" clauses and assigned no open window at all,
  // we don't actually know the open hours → degrade (return null) rather than
  // claim the business is closed all week.
  const hasOpenDay = Object.values(schedule).some((d) => d !== null);
  if (!hasOpenDay) return null;

  return schedule;
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD date, parsed as UTC midnight. */
function dayOfWeek(date: string): number | null {
  const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return Number.isNaN(dow) ? null : dow;
}

/** Is the business open at all on this YYYY-MM-DD date? */
export function isOpenOn(schedule: WeeklySchedule, date: string): boolean {
  const dow = dayOfWeek(date);
  if (dow === null) return false;
  return schedule[dow] != null;
}

/** Parse "HH:mm" / "H:mm" wall-clock into minutes-from-midnight, or null. */
function parseHHMM(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    // Tolerate a 12h "9am"/"2:30pm" here too for lenient call paths.
    return parseTimeToken(time);
  }
  const hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (hour > 23 || min > 59) return null;
  return hour * 60 + min;
}

/**
 * Is `time` ("HH:mm", 24h) within the open window on `date`? Open day AND
 * time in [openMin, closeMin). Returns false on a closed day / unparseable time.
 */
export function isWithinHours(
  schedule: WeeklySchedule,
  date: string,
  time: string,
): boolean {
  const dow = dayOfWeek(date);
  if (dow === null) return false;
  const day = schedule[dow];
  if (!day) return false;
  const mins = parseHHMM(time);
  if (mins === null) return false;
  return mins >= day.openMin && mins < day.closeMin;
}

/** Format minutes-from-midnight as "HH:mm" (24h, zero-padded). */
export function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Plain-language hours label for a day index, e.g. "Saturday 9:00–13:00". */
export function describeDay(schedule: WeeklySchedule, dow: number): string {
  const day = schedule[dow];
  const label = DAY_LABEL[dow] ?? "that day";
  if (!day) return `closed ${label}`;
  return `${label} ${toHHMM(day.openMin)}–${toHHMM(day.closeMin)}`;
}

/**
 * Generate REAL bookable "HH:mm" slots within the open window on `date`.
 * Slots land on the step grid (default :00 / :30), start at the open time, and
 * stop before close. Returns [] when the day is closed or the date is bad.
 */
export function slotsFor(
  schedule: WeeklySchedule,
  date: string,
  opts: SlotOptions = {},
): string[] {
  const dow = dayOfWeek(date);
  if (dow === null) return [];
  const day = schedule[dow];
  if (!day) return [];

  const step = opts.stepMin && opts.stepMin > 0 ? opts.stepMin : 30;
  const max = opts.max && opts.max > 0 ? opts.max : 4;
  const lastBefore = opts.lastBeforeCloseMin ?? 0;
  const latestStart = day.closeMin - Math.max(lastBefore, 0);

  // Align the first slot up to the step grid from the open time.
  const first = Math.ceil(day.openMin / step) * step;
  const slots: string[] = [];
  for (let t = Math.max(first, day.openMin); t < latestStart; t += step) {
    slots.push(toHHMM(t));
    if (slots.length >= max) break;
  }
  return slots;
}
