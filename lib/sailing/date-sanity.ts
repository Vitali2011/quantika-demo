/**
 * Sanity checks for shipping dates — laycan validity, vessel-position staleness.
 *
 * Purpose: catch obviously-broken inputs BEFORE they get matched.
 *   - Laycan end before start → typo in broker email, do not match on impossible window
 *   - Vessel position > 5 days old → real vessels don't sit still; the listing is stale
 *     and likely already fixed on another cargo
 *   - Very-old positions (> 30 days) → almost certainly bogus/forgotten
 */

import type { DateRange } from './date-parsing';

const MS_PER_DAY = 86_400_000;

// ────────────────────────────────────────────────────────────────────────────

export interface LaycanValidity {
  valid: boolean;
  reason?: string;
  warning?: string;
}

/**
 * A laycan window is valid if end >= start, and reasonably sized (< 60 days).
 * Empty / null inputs are treated as invalid (a missing laycan doesn't match "any vessel").
 */
export function isLaycanValid(range: DateRange | null | undefined): LaycanValidity {
  if (!range) return { valid: false, reason: 'laycan missing' };
  if (range.end.getTime() < range.start.getTime()) {
    return { valid: false, reason: 'laycan end before start (inverted / typo)' };
  }
  const spanDays = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
  if (spanDays > 60) {
    return { valid: true, warning: `unusually long laycan window (${Math.round(spanDays)} days)` };
  }
  return { valid: true };
}

// ────────────────────────────────────────────────────────────────────────────

export interface StaleResult {
  stale: boolean;
  veryStale: boolean;
  daysOld: number | null;
}

/**
 * A vessel "open" position is stale if the open date is more than `thresholdDays`
 * in the past (relative to `today`). Real ships don't sit idle — a 10-day-old
 * listing likely means the vessel has already fixed.
 */
export function isOpenDateStale(
  openDate: Date | null | undefined,
  today: Date,
  thresholdDays = 5,
): StaleResult {
  if (!openDate) return { stale: false, veryStale: false, daysOld: null };
  const ageDays = (today.getTime() - openDate.getTime()) / MS_PER_DAY;
  if (ageDays <= 0) return { stale: false, veryStale: false, daysOld: 0 };
  const stale = ageDays > thresholdDays;
  const veryStale = ageDays > 30;
  return { stale, veryStale, daysOld: Math.round(ageDays) };
}

// ────────────────────────────────────────────────────────────────────────────

export interface DateValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Combined check for a cargo-vessel pair: laycan must be valid; vessel position
 * staleness is reported as issue but does not invalidate (staleness reduces
 * confidence, not possibility).
 */
export function validateDates(input: {
  openDate: Date | null | undefined;
  laycan: DateRange | null | undefined;
  today: Date;
  staleThresholdDays?: number;
}): DateValidationResult {
  const issues: string[] = [];
  let valid = true;

  const lc = isLaycanValid(input.laycan);
  if (!lc.valid) {
    valid = false;
    if (lc.reason) issues.push(`Laycan: ${lc.reason}`);
  } else if (lc.warning) {
    issues.push(`Laycan: ${lc.warning}`);
  }

  const st = isOpenDateStale(input.openDate, input.today, input.staleThresholdDays ?? 5);
  if (st.stale) {
    const tag = st.veryStale ? 'very stale' : 'stale';
    issues.push(`Vessel position ${tag} — ${st.daysOld}d old, may already be fixed`);
  }

  return { valid, issues };
}
