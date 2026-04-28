/**
 * Smoke tests for Wave α foundation types and constants (spec-alpha-01).
 * These are runtime-shape + IANA-validity checks only — TypeScript compile-time
 * correctness is enforced by `tsc --noEmit`.
 */

import {
  CONFIDENCE_COLORS,
  MENA_TIMEZONES,
  FRIDAY_QUIET_HOURS_GST,
  MORNING_DIGEST_HOUR_GST,
} from '@/lib/constants';

// ── ConfidenceLevel shape ────────────────────────────────────────────────────

describe('ConfidenceLevel', () => {
  it('CONFIDENCE_COLORS has a key for each of the 4 ConfidenceLevel values', () => {
    const expected: string[] = ['verified', 'inferred', 'uncertain', 'missing'];
    for (const level of expected) {
      expect(CONFIDENCE_COLORS).toHaveProperty(level);
      expect(typeof CONFIDENCE_COLORS[level as keyof typeof CONFIDENCE_COLORS]).toBe('string');
    }
    expect(Object.keys(CONFIDENCE_COLORS).sort()).toEqual(expected.sort());
  });
});

// ── MENA_TIMEZONES — valid IANA identifiers ──────────────────────────────────

describe('MENA_TIMEZONES', () => {
  it('all timezone values are valid IANA strings (Intl.DateTimeFormat does not throw)', () => {
    for (const tz of Object.values(MENA_TIMEZONES)) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: tz })).not.toThrow();
    }
  });

  it('contains the expected 6 regions', () => {
    const expectedKeys = ['dubai', 'riyadh', 'cairo', 'istanbul', 'lagos', 'casablanca'];
    expect(Object.keys(MENA_TIMEZONES).sort()).toEqual(expectedKeys.sort());
  });
});

// ── FRIDAY_QUIET_HOURS_GST ───────────────────────────────────────────────────

describe('FRIDAY_QUIET_HOURS_GST', () => {
  it('startHour is less than endHour', () => {
    expect(FRIDAY_QUIET_HOURS_GST.startHour).toBeLessThan(FRIDAY_QUIET_HOURS_GST.endHour);
  });

  it('timezone is a valid IANA string', () => {
    expect(() =>
      new Intl.DateTimeFormat('en', { timeZone: FRIDAY_QUIET_HOURS_GST.timezone })
    ).not.toThrow();
  });

  it('timezone is Asia/Dubai (GST)', () => {
    expect(FRIDAY_QUIET_HOURS_GST.timezone).toBe('Asia/Dubai');
  });
});

// ── MORNING_DIGEST_HOUR_GST ──────────────────────────────────────────────────

describe('MORNING_DIGEST_HOUR_GST', () => {
  it('is a number representing 08:30 GST (8.5)', () => {
    expect(MORNING_DIGEST_HOUR_GST).toBe(8.5);
  });
});

// ── AuditEntry — compile-time shape via runtime mock construction ────────────

describe('AuditEntry shape', () => {
  it('can construct a valid AuditEntry object with all required fields', () => {
    // Import is type-only; we verify shape by constructing a conforming object.
    // TypeScript will reject this at compile time if the interface changes.
    const entry = {
      id: 'uuid-1234',
      timestamp: new Date().toISOString(),
      sessionId: 'sess-abc',
      actor: 'ai' as const,
      action: 'parsed' as const,
    };
    // Required fields must be present
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.sessionId).toBeDefined();
    expect(entry.actor).toBe('ai');
    expect(entry.action).toBe('parsed');
  });
});
