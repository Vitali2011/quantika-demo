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
