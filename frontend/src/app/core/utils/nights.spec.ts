import {
  nightsToMask, maskToNights, hasNight, toggleNight,
  sharedNightCount, hasAnyOverlap, nightDate, ALL_NIGHTS_MASK
} from './nights';

/**
 * The bitmask is load-bearing: it is the heaviest term in the match score and
 * the main discovery filter. A bit-order mistake would silently match people
 * who are never at a garba on the same night.
 *
 * These must agree exactly with shared_nights() in
 * supabase/migrations/0003_functions_and_triggers.sql.
 */
describe('nights bitmask', () => {
  it('maps night 1 to the lowest bit', () => {
    expect(nightsToMask([1])).toBe(1);
  });

  it('maps night 9 to bit 8', () => {
    expect(nightsToMask([9])).toBe(256);
  });

  it('maps all nine nights to 511', () => {
    expect(nightsToMask([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(ALL_NIGHTS_MASK);
    expect(ALL_NIGHTS_MASK).toBe(511);
  });

  it('round-trips through mask and back', () => {
    const nights = [1, 3, 5, 9];
    expect(maskToNights(nightsToMask(nights))).toEqual(nights as never);
  });

  it('ignores out-of-range and non-integer nights', () => {
    expect(nightsToMask([0])).toBe(0);
    expect(nightsToMask([10])).toBe(0);
    expect(nightsToMask([-1])).toBe(0);
    expect(nightsToMask([1.5])).toBe(0);
    expect(nightsToMask([1, 99, 3])).toBe(nightsToMask([1, 3]));
  });

  it('is idempotent for duplicates', () => {
    expect(nightsToMask([2, 2, 2])).toBe(nightsToMask([2]));
  });

  it('handles an empty selection', () => {
    expect(nightsToMask([])).toBe(0);
    expect(maskToNights(0)).toEqual([]);
  });

  describe('hasNight', () => {
    it('reads individual bits', () => {
      const mask = nightsToMask([2, 7]);
      expect(hasNight(mask, 2)).toBeTrue();
      expect(hasNight(mask, 7)).toBeTrue();
      expect(hasNight(mask, 1)).toBeFalse();
      expect(hasNight(mask, 9)).toBeFalse();
    });

    it('rejects out-of-range nights', () => {
      expect(hasNight(ALL_NIGHTS_MASK, 0)).toBeFalse();
      expect(hasNight(ALL_NIGHTS_MASK, 10)).toBeFalse();
    });
  });

  describe('toggleNight', () => {
    it('adds then removes', () => {
      let mask = 0;
      mask = toggleNight(mask, 4);
      expect(hasNight(mask, 4)).toBeTrue();
      mask = toggleNight(mask, 4);
      expect(hasNight(mask, 4)).toBeFalse();
    });

    it('leaves other nights untouched', () => {
      const mask = toggleNight(nightsToMask([1, 2, 3]), 2);
      expect(maskToNights(mask)).toEqual([1, 3] as never);
    });

    it('ignores invalid nights', () => {
      const mask = nightsToMask([1]);
      expect(toggleNight(mask, 0)).toBe(mask);
      expect(toggleNight(mask, 10)).toBe(mask);
    });
  });

  describe('sharedNightCount', () => {
    it('counts overlapping nights', () => {
      expect(sharedNightCount(nightsToMask([1, 2, 3]), nightsToMask([2, 3, 4]))).toBe(2);
    });

    it('is zero when nobody overlaps', () => {
      expect(sharedNightCount(nightsToMask([1, 2]), nightsToMask([8, 9]))).toBe(0);
    });

    it('matches the SQL fixture used in the RLS tests', () => {
      // shared_nights(448, 192) = 2 is asserted in supabase/test/01_rls_tests.sql.
      // If these ever disagree, ranking in the app differs from ranking in the
      // deck builder.
      expect(sharedNightCount(448, 192)).toBe(2);
    });

    it('counts all nine when both attend everything', () => {
      expect(sharedNightCount(ALL_NIGHTS_MASK, ALL_NIGHTS_MASK)).toBe(9);
    });

    it('ignores bits above night 9', () => {
      expect(sharedNightCount(0b1111111111, ALL_NIGHTS_MASK)).toBe(9);
    });
  });

  describe('hasAnyOverlap', () => {
    it('is true on a single shared night', () => {
      expect(hasAnyOverlap(nightsToMask([5]), nightsToMask([1, 5, 9]))).toBeTrue();
    });

    it('is false with no shared nights', () => {
      expect(hasAnyOverlap(nightsToMask([1]), nightsToMask([2]))).toBeFalse();
    });

    it('is false when either side has selected nothing', () => {
      expect(hasAnyOverlap(0, ALL_NIGHTS_MASK)).toBeFalse();
    });
  });

  describe('nightDate', () => {
    const START = '2026-10-11'; // Navratri 2026, night 1

    it('night 1 is the festival start date', () => {
      const d = nightDate(1, START);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(9); // October
      expect(d.getDate()).toBe(11);
    });

    it('night 9 is eight days later', () => {
      expect(nightDate(9, START).getDate()).toBe(19);
    });

    it('rolls across a month boundary correctly', () => {
      const d = nightDate(9, '2026-10-28');
      expect(d.getMonth()).toBe(10); // November
      expect(d.getDate()).toBe(5);
    });
  });
});
