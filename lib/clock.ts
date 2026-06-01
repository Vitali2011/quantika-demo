/**
 * Single source of "current time" for the app.
 *
 * In DEMO_MODE returns frozen_date from demo_seed_meta (loaded once, cached).
 * Otherwise returns real wall-clock time.
 *
 * MUST be used everywhere matching/freshness/expiry/laycan compares "now"
 * against email/cargo/vessel dates.
 *
 * Do NOT use for: audit log timestamps, auth session expiry, file mtime,
 * cron scheduling — those must use real time.
 *
 * See docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md
 */
import { isDemoMode, getDemoFrozenDate } from './demo-mode';

export function now(): Date {
  if (isDemoMode()) {
    return new Date(getDemoFrozenDate() + 'T00:00:00.000Z');
  }
  return new Date();
}

export function today(): string {
  return now().toISOString().slice(0, 10);
}

/**
 * Demo-frozen clock as milliseconds since epoch (like Date.now()).
 * Use for client-facing timestamps: freshness, score decay, laycan expiry.
 *
 * In DEMO_MODE resolves the frozen date at noon UTC via:
 *   (a) demo_seed_meta.frozen_date (DB, cached)
 *   (b) process.env.DEMO_CLOCK (e.g. "2026-05-28")
 *   (c) default '2026-05-28'
 *
 * Outside DEMO_MODE returns real Date.now().
 */
export function demoNow(): number {
  if (!isDemoMode()) return Date.now();
  try {
    const frozen = getDemoFrozenDate();
    return new Date(frozen + 'T12:00:00.000Z').getTime();
  } catch {
    // DB unavailable — fall through
  }
  const envClock = process.env.DEMO_CLOCK;
  if (envClock) return new Date(envClock + 'T12:00:00.000Z').getTime();
  return new Date('2026-05-28T12:00:00.000Z').getTime();
}
