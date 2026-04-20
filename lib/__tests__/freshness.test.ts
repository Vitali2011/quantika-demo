import { calculateExpiry, isStale } from '../freshness';

// Constants mirror lib/constants.ts values (used as guards in tests)
const DOCUMENT_DAYS = 30;
const CLIENT_REPLY_DAYS = 3;

const BASE_DATE = '2024-01-10T12:00:00.000Z';

describe('calculateExpiry', () => {
  describe('VESSEL_POSITION', () => {
    it('uses openDate when vessel has an openDate', () => {
      const openDate = '2024-02-01T00:00:00.000Z';
      const result = calculateExpiry(BASE_DATE, 'VESSEL_POSITION', null, {
        openDate: { value: openDate, confidence: 'confirmed' },
      } as Parameters<typeof calculateExpiry>[3]);
      expect(result.expiryDate).toBe(openDate);
      expect(result.expirySource).toBe('openDate');
    });

    it('falls back to +5 days from email date when no openDate', () => {
      const result = calculateExpiry(BASE_DATE, 'VESSEL_POSITION', null, null);
      const expected = new Date('2024-01-15T12:00:00.000Z').toISOString();
      expect(result.expiryDate).toBe(expected);
      expect(result.expirySource).toBe('default');
    });

    it('falls back to default when openDate is invalid', () => {
      const result = calculateExpiry(BASE_DATE, 'VESSEL_POSITION', null, {
        openDate: { value: 'not-a-date', confidence: 'uncertain' },
      } as Parameters<typeof calculateExpiry>[3]);
      expect(result.expirySource).toBe('default');
      expect(result.expiryDate).not.toBeNull();
    });
  });

  describe('CARGO_INQUIRY', () => {
    it('uses laycan date when cargo has a laycan', () => {
      const laycan = '2024-03-01T00:00:00.000Z';
      const result = calculateExpiry(
        BASE_DATE,
        'CARGO_INQUIRY',
        { laycan } as Parameters<typeof calculateExpiry>[2],
        null,
      );
      expect(result.expiryDate).toBe(laycan);
      expect(result.expirySource).toBe('laycan');
    });

    it('falls back to +5 days when no laycan', () => {
      const result = calculateExpiry(BASE_DATE, 'CARGO_INQUIRY', null, null);
      const expected = new Date('2024-01-15T12:00:00.000Z').toISOString();
      expect(result.expiryDate).toBe(expected);
      expect(result.expirySource).toBe('default');
    });

    it('parses broker laycan "01-05 Oct 2026" to Oct 5', () => {
      const result = calculateExpiry(
        '2026-04-05T00:00:00.000Z',
        'CARGO_INQUIRY',
        { laycan: '01-05 Oct 2026' } as Parameters<typeof calculateExpiry>[2],
        null,
      );
      expect(result.expirySource).toBe('laycan');
      expect(result.expiryDate).toBe(new Date(Date.UTC(2026, 9, 5)).toISOString());
    });

    it('parses broker laycan "15-25 Sep" in email-year', () => {
      const result = calculateExpiry(
        '2026-04-05T00:00:00.000Z',
        'CARGO_INQUIRY',
        { laycan: '15-25 Sep' } as Parameters<typeof calculateExpiry>[2],
        null,
      );
      expect(result.expirySource).toBe('laycan');
      expect(result.expiryDate).toBe(new Date(Date.UTC(2026, 8, 25)).toISOString());
    });

    it('parses broker laycan "Sep 15-30"', () => {
      const result = calculateExpiry(
        '2026-04-05T00:00:00.000Z',
        'CARGO_INQUIRY',
        { laycan: 'Sep 15-30' } as Parameters<typeof calculateExpiry>[2],
        null,
      );
      expect(result.expirySource).toBe('laycan');
      expect(result.expiryDate).toBe(new Date(Date.UTC(2026, 8, 30)).toISOString());
    });

    it('future laycan makes record non-stale even 15 days after email', () => {
      // Regression: before the fix, "01-05 Oct 2026" failed to parse and
      // silently fell back to emailDate+5d → stale after 5 days.
      const emailDate = '2026-04-05T00:00:00.000Z';
      const result = calculateExpiry(
        emailDate,
        'CARGO_INQUIRY',
        { laycan: '01-05 Oct 2026' } as Parameters<typeof calculateExpiry>[2],
        null,
      );
      // Simulate "today" = 2026-04-20 (15 days later)
      const today = new Date('2026-04-20T00:00:00.000Z');
      const expiry = new Date(result.expiryDate!);
      expect(expiry.getTime()).toBeGreaterThan(today.getTime());
    });
  });

  describe('VESSEL_POSITION broker dates', () => {
    it('parses vessel openDate "Sep 6-8" as start of window', () => {
      const result = calculateExpiry(
        '2026-04-07T00:00:00.000Z',
        'VESSEL_POSITION',
        null,
        { openDate: { value: 'Sep 6-8', confidence: 'confirmed' } } as Parameters<typeof calculateExpiry>[3],
      );
      expect(result.expirySource).toBe('openDate');
      // parseVesselOpenDate returns start-of-window: Sep 6
      expect(result.expiryDate).toBe(new Date(Date.UTC(2026, 8, 6)).toISOString());
    });

    it('parses vessel openDate "end Aug / early Sep" phrase', () => {
      const result = calculateExpiry(
        '2026-04-06T00:00:00.000Z',
        'VESSEL_POSITION',
        null,
        { openDate: { value: 'end Aug', confidence: 'interpreted' } } as Parameters<typeof calculateExpiry>[3],
      );
      expect(result.expirySource).toBe('openDate');
      // "end Aug" → phraseDay for "end" = 27 in refYear 2026
      const parsed = new Date(result.expiryDate!);
      expect(parsed.getUTCMonth()).toBe(7); // Aug
      expect(parsed.getUTCFullYear()).toBe(2026);
    });
  });

  describe('FIXTURE_RECAP', () => {
    it('returns null expiryDate (permanent)', () => {
      const result = calculateExpiry(BASE_DATE, 'FIXTURE_RECAP', null, null);
      expect(result.expiryDate).toBeNull();
      expect(result.expirySource).toBe('permanent');
    });
  });

  describe('DOCUMENT', () => {
    it('returns +30 days from email date', () => {
      const result = calculateExpiry(BASE_DATE, 'DOCUMENT', null, null);
      const expected = new Date('2024-02-09T12:00:00.000Z').toISOString();
      expect(result.expiryDate).toBe(expected);
      expect(result.expirySource).toBe('fixed');
      expect(DOCUMENT_DAYS).toBe(30); // guard
    });
  });

  describe('CLIENT_REPLY', () => {
    it('returns +3 days from email date', () => {
      const result = calculateExpiry(BASE_DATE, 'CLIENT_REPLY', null, null);
      const expected = new Date('2024-01-13T12:00:00.000Z').toISOString();
      expect(result.expiryDate).toBe(expected);
      expect(result.expirySource).toBe('fixed');
      expect(CLIENT_REPLY_DAYS).toBe(3); // guard
    });
  });

  describe('default / OTHER', () => {
    it('returns null for unknown category', () => {
      const result = calculateExpiry(BASE_DATE, 'OTHER' as Parameters<typeof calculateExpiry>[1], null, null);
      expect(result.expiryDate).toBeNull();
      expect(result.expirySource).toBeNull();
    });
  });

  it('returns null when emailDate is invalid', () => {
    const result = calculateExpiry('not-a-date', 'VESSEL_POSITION', null, null);
    expect(result.expiryDate).toBeNull();
    expect(result.expirySource).toBeNull();
  });
});

describe('isStale', () => {
  it('returns false for null expiryDate', () => {
    expect(isStale(null)).toBe(false);
  });

  it('returns false for invalid expiryDate string', () => {
    expect(isStale('not-a-date')).toBe(false);
  });

  it('returns true for a past expiryDate', () => {
    expect(isStale('2000-01-01T00:00:00.000Z')).toBe(true);
  });

  it('returns false for a future expiryDate', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    expect(isStale(future)).toBe(false);
  });
});
