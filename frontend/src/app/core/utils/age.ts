/**
 * Age and the 18+ gate.
 *
 * The database enforces this too (the `adult_only` CHECK on profiles), and that
 * is the real gate — this exists so the user gets a clear message at the moment
 * they enter a date, instead of a rejected insert three screens later.
 *
 * Pure functions, no Angular, so they are cheap to test exhaustively.
 */

export const MIN_AGE = 18;
export const MAX_AGE = 100;

/**
 * Completed years between a date of birth and a reference date.
 * Returns null for anything unparseable rather than NaN, so callers can't
 * accidentally compare NaN >= 18 (which is false, but for the wrong reason).
 */
export function ageOn(dateOfBirth: string | Date, on: Date = new Date()): number | null {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : parseIsoDate(dateOfBirth);
  if (!dob) return null;

  let age = on.getFullYear() - dob.getFullYear();

  // Birthday not yet reached this year.
  const monthDiff = on.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

export function isAdult(dateOfBirth: string | Date, on: Date = new Date()): boolean {
  const age = ageOn(dateOfBirth, on);
  return age !== null && age >= MIN_AGE;
}

export type DobProblem = 'required' | 'invalid' | 'future' | 'too_young' | 'too_old';

/** Returns null when the date is acceptable, otherwise why it isn't. */
export function validateDob(value: string | null | undefined, on: Date = new Date()): DobProblem | null {
  if (!value || !value.trim()) return 'required';

  const dob = parseIsoDate(value);
  if (!dob) return 'invalid';

  if (dob.getTime() > on.getTime()) return 'future';

  const age = ageOn(dob, on)!;
  if (age < MIN_AGE) return 'too_young';
  if (age > MAX_AGE) return 'too_old';

  return null;
}

export const DOB_MESSAGES: Record<DobProblem, string> = {
  required: 'Please enter your date of birth',
  invalid: 'That date doesn’t look right',
  future: 'Date of birth can’t be in the future',
  too_young: 'You must be 18 or older to use GarbaTaal',
  too_old: 'Please check the year'
};

/** Latest date of birth that is still 18+ — used as the max on a date input. */
export function latestAdultDob(on: Date = new Date()): string {
  const d = new Date(on.getFullYear() - MIN_AGE, on.getMonth(), on.getDate());
  return toIsoDate(d);
}

export function earliestDob(on: Date = new Date()): string {
  const d = new Date(on.getFullYear() - MAX_AGE, on.getMonth(), on.getDate());
  return toIsoDate(d);
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * Parses YYYY-MM-DD as a LOCAL date.
 *
 * `new Date('2000-01-01')` parses as UTC midnight, which in IST (UTC+5:30) is
 * still 2000-01-01, but west of UTC it becomes the previous day — shifting
 * everyone's birthday by one and flipping the 18+ check for anyone born exactly
 * 18 years ago today.
 */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, y, m, d] = match;
  const year = +y, month = +m, day = +d;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);

  // Rejects rolled-over dates like 2001-02-30, which JS would silently accept.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
