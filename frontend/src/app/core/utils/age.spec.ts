import { ageOn, isAdult, validateDob, latestAdultDob, earliestDob, DOB_MESSAGES } from './age';

/**
 * The 18+ gate. Getting this wrong in either direction is serious: too lenient
 * puts minors on a platform where adults meet strangers; too strict locks out
 * legitimate users on their birthday.
 */
describe('age', () => {
  // Fixed reference date so these never break on a different day.
  const TODAY = new Date(2026, 8, 30); // 30 Sep 2026

  describe('ageOn', () => {
    it('counts completed years', () => {
      expect(ageOn('2000-09-30', TODAY)).toBe(26);
      expect(ageOn('1996-01-15', TODAY)).toBe(30);
    });

    it('does not count a birthday that has not happened yet this year', () => {
      expect(ageOn('2000-10-01', TODAY)).toBe(25); // tomorrow
      expect(ageOn('2000-12-31', TODAY)).toBe(25);
    });

    it('counts the birthday on the day itself', () => {
      expect(ageOn('2008-09-30', TODAY)).toBe(18);
    });

    it('handles a 29 February birthday', () => {
      expect(ageOn('2004-02-29', TODAY)).toBe(22);
    });

    it('returns null rather than NaN for bad input', () => {
      expect(ageOn('not-a-date', TODAY)).toBeNull();
      expect(ageOn('', TODAY)).toBeNull();
      expect(ageOn('2001-13-01', TODAY)).toBeNull();
      expect(ageOn('2001-02-30', TODAY)).toBeNull(); // JS would roll this to 2 March
    });

    it('accepts a Date object', () => {
      expect(ageOn(new Date(2000, 0, 1), TODAY)).toBe(26);
    });
  });

  describe('isAdult', () => {
    it('admits someone who turns 18 today', () => {
      // The boundary that matters. An off-by-one here locks out a real user on
      // their birthday, which is exactly when they are most likely to sign up.
      expect(isAdult('2008-09-30', TODAY)).toBeTrue();
    });

    it('rejects someone who turns 18 tomorrow', () => {
      expect(isAdult('2008-10-01', TODAY)).toBeFalse();
    });

    it('rejects a clearly underage date', () => {
      expect(isAdult('2015-01-01', TODAY)).toBeFalse();
    });

    it('rejects unparseable input rather than defaulting to allowed', () => {
      expect(isAdult('garbage', TODAY)).toBeFalse();
      expect(isAdult('', TODAY)).toBeFalse();
    });
  });

  describe('validateDob', () => {
    it('accepts a valid adult date', () => {
      expect(validateDob('2000-05-20', TODAY)).toBeNull();
    });

    it('flags each failure distinctly', () => {
      expect(validateDob('', TODAY)).toBe('required');
      expect(validateDob('   ', TODAY)).toBe('required');
      expect(validateDob('20-05-2000', TODAY)).toBe('invalid');
      expect(validateDob('2027-01-01', TODAY)).toBe('future');
      expect(validateDob('2010-01-01', TODAY)).toBe('too_young');
      expect(validateDob('1900-01-01', TODAY)).toBe('too_old');
    });

    it('has a message for every problem', () => {
      const problems = ['required', 'invalid', 'future', 'too_young', 'too_old'] as const;
      for (const p of problems) {
        expect(DOB_MESSAGES[p]).toBeTruthy();
      }
    });
  });

  describe('date input bounds', () => {
    it('latestAdultDob is exactly 18 years ago', () => {
      expect(latestAdultDob(TODAY)).toBe('2008-09-30');
    });

    it('the latest allowed date passes the gate', () => {
      expect(isAdult(latestAdultDob(TODAY), TODAY)).toBeTrue();
    });

    it('earliestDob is 100 years ago', () => {
      expect(earliestDob(TODAY)).toBe('1926-09-30');
    });
  });

  describe('timezone safety', () => {
    it('treats YYYY-MM-DD as a local date, not UTC', () => {
      // new Date('2008-09-30') parses as UTC midnight. West of UTC that becomes
      // 29 Sep locally, making an 18-year-old look 17 and blocking them.
      expect(isAdult('2008-09-30', TODAY)).toBeTrue();
      expect(ageOn('2008-09-30', TODAY)).toBe(18);
    });
  });
});
