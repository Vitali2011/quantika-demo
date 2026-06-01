/**
 * Behavioral tests for demoNow() — demo-freshness clock.
 *
 * Verifies:
 *   1. Non-demo mode: returns real Date.now() (not frozen)
 *   2. Demo mode + env DEMO_CLOCK: returns noon UTC of that date
 *   3. Demo mode + default fallback: returns '2026-05-28' noon UTC
 *   4. Frozen date is stable under a shifted system clock (mock via DEMO_CLOCK)
 *   5. session-store / trial are NOT exported from clock.ts (deny-list guard)
 */

import { demoNow } from '@/lib/clock';

const FROZEN_DATE = '2026-05-28';
const FROZEN_NOON_MS = new Date('2026-05-28T12:00:00.000Z').getTime();

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('demoNow() — behavioral', () => {
  it('non-demo mode: returns real timestamp (not frozen)', () => {
    withEnv({ DEMO_MODE: 'false', DEMO_CLOCK: undefined }, () => {
      const before = Date.now();
      const result = demoNow();
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
      expect(result).not.toBe(FROZEN_NOON_MS);
    });
  });

  it('demo mode + DEMO_CLOCK env: returns noon UTC of that date', () => {
    withEnv({ DEMO_MODE: 'true', DEMO_CLOCK: FROZEN_DATE }, () => {
      // getDemoFrozenDate will throw (no DB) — should fall through to DEMO_CLOCK
      const result = demoNow();
      expect(result).toBe(FROZEN_NOON_MS);
    });
  });

  it('demo mode + no env: returns default 2026-05-28 noon UTC', () => {
    withEnv({ DEMO_MODE: 'true', DEMO_CLOCK: undefined }, () => {
      const result = demoNow();
      expect(result).toBe(FROZEN_NOON_MS);
    });
  });

  it('frozen timestamp is stable — does not change between calls in demo mode', () => {
    withEnv({ DEMO_MODE: 'true', DEMO_CLOCK: FROZEN_DATE }, () => {
      const t1 = demoNow();
      const t2 = demoNow();
      expect(t1).toBe(t2);
    });
  });

  it('DEMO_CLOCK knob: changing date changes the demo clock (one knob)', () => {
    withEnv({ DEMO_MODE: 'true', DEMO_CLOCK: '2026-06-01' }, () => {
      const june1Noon = new Date('2026-06-01T12:00:00.000Z').getTime();
      expect(demoNow()).toBe(june1Noon);
    });
    withEnv({ DEMO_MODE: 'true', DEMO_CLOCK: FROZEN_DATE }, () => {
      expect(demoNow()).toBe(FROZEN_NOON_MS);
    });
  });
});

describe('demoNow() — deny-list guard (session/trial NOT frozen)', () => {
  it('clock.ts does not export session-store utilities', () => {
    // If session-store is imported from clock.ts, these would be defined.
    // This ensures we never accidentally freeze session expiry.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clockModule = require('@/lib/clock');
    expect(clockModule.getSessionExpiry).toBeUndefined();
    expect(clockModule.cleanupExpiredSessions).toBeUndefined();
  });

  it('clock.ts does not export trial utilities', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clockModule = require('@/lib/clock');
    expect(clockModule.getTrialState).toBeUndefined();
    expect(clockModule.isExpired).toBeUndefined();
  });
});
