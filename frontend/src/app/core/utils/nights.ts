/**
 * Navratri nights as a 9-bit mask.
 *
 * The schema stores availability as a single integer where bit N (1-indexed)
 * means "attending night N". Overlap between two users is then a bitwise AND,
 * which is indexable and costs one integer per user instead of a join table.
 *
 * Bit layout: night 1 = bit 0 (value 1), night 9 = bit 8 (value 256).
 * All nine nights = 511.
 */

export const TOTAL_NIGHTS = 9;
export const ALL_NIGHTS_MASK = 0b111111111; // 511

export type NightNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const NIGHTS: readonly NightNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function nightsToMask(nights: readonly number[]): number {
  return nights.reduce((mask, n) => {
    if (n < 1 || n > TOTAL_NIGHTS || !Number.isInteger(n)) return mask;
    return mask | (1 << (n - 1));
  }, 0);
}

export function maskToNights(mask: number): NightNumber[] {
  const out: NightNumber[] = [];
  for (const n of NIGHTS) {
    if (hasNight(mask, n)) out.push(n);
  }
  return out;
}

export function hasNight(mask: number, night: number): boolean {
  if (night < 1 || night > TOTAL_NIGHTS) return false;
  return (mask & (1 << (night - 1))) !== 0;
}

export function toggleNight(mask: number, night: number): number {
  if (night < 1 || night > TOTAL_NIGHTS) return mask;
  return mask ^ (1 << (night - 1));
}

/** How many nights two people share — the heaviest term in the match score. */
export function sharedNightCount(a: number, b: number): number {
  let overlap = a & b & ALL_NIGHTS_MASK;
  let count = 0;
  while (overlap) {
    overlap &= overlap - 1; // clears the lowest set bit
    count++;
  }
  return count;
}

export function hasAnyOverlap(a: number, b: number): boolean {
  return (a & b & ALL_NIGHTS_MASK) !== 0;
}

/**
 * Calendar date for a given night, derived from the festival start date.
 * Night 1 is the start date itself.
 */
export function nightDate(night: number, festivalStartIso: string): Date {
  const [y, m, d] = festivalStartIso.split('-').map(Number);
  return new Date(y, m - 1, d + (night - 1));
}

export function formatNightLabel(night: number, festivalStartIso: string): string {
  const date = nightDate(night, festivalStartIso);
  return `Night ${night} · ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}
