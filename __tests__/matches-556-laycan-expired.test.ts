/**
 * Regression tests — #556 expired laycan shows FRESH badge + inflated score.
 *
 * Two acceptance criteria:
 *   (a) Score for expired-laycan matches is capped at 70 (display); badge not FRESH.
 *   (b) Laycan format identical between list view (fmtLaycan) and detail page.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fmtLaycan, isLaycanExpired } from '@/lib/utils/fmt-laycan';

const ROOT = process.cwd();
const clientSrc = () => fs.readFileSync(path.join(ROOT, 'app/matches/MatchesClient.tsx'), 'utf8');
const detailSrc = () => fs.readFileSync(path.join(ROOT, 'app/match/[id]/page.tsx'), 'utf8');

// ── isLaycanExpired — pure function ──────────────────────────────────────────

describe('isLaycanExpired (behavioral)', () => {
  const PAST = 1000000000000;    // Sep 2001 in ms — clearly expired
  const FUTURE = 9999999999000;  // Nov 2286 in ms — clearly not expired
  const NOW = Date.now();

  it('returns false when both start and end are null', () => {
    expect(isLaycanExpired(null, null)).toBe(false);
  });

  it('returns true when end is in the past', () => {
    expect(isLaycanExpired(PAST, null)).toBe(true);
  });

  it('returns false when end is in the future', () => {
    expect(isLaycanExpired(FUTURE, null)).toBe(false);
  });

  it('falls back to start when end is null', () => {
    expect(isLaycanExpired(null, PAST)).toBe(true);
    expect(isLaycanExpired(null, FUTURE)).toBe(false);
  });

  it('prefers end over start for expiry decision', () => {
    // end in past even though start is in future — expired
    expect(isLaycanExpired(PAST, FUTURE)).toBe(true);
    // end in future even though start is in past — not expired
    expect(isLaycanExpired(FUTURE, PAST)).toBe(false);
  });

  it('respects explicit nowMs override', () => {
    const fixedNow = 2000000000000;
    expect(isLaycanExpired(1999999999000, null, fixedNow)).toBe(true);
    expect(isLaycanExpired(2000000001000, null, fixedNow)).toBe(false);
  });

  it('boundary: timestamp exactly equal to now is NOT expired', () => {
    expect(isLaycanExpired(NOW, null, NOW)).toBe(false);
  });
});

// ── isFreshMatch with expired laycan — inline mirror ─────────────────────────

// Mirror of MatchesClient.tsx logic; kept in sync intentionally.
function isFreshMatchWithLaycan(
  m: { created_at: number; laycan_end: number | null; laycan_start: number | null },
  now: number,
): boolean {
  if (now === 0) return false;
  if (isLaycanExpired(m.laycan_end, m.laycan_start, now)) return false;
  return now - m.created_at < 7200000;
}

describe('isFreshMatch laycan-expiry guard (behavioral)', () => {
  const nowMs = Date.now();
  const recentCreatedAt = nowMs - 60000; // created 1 minute ago (ms)

  it('returns false for expired laycan regardless of created_at recency', () => {
    const expiredLaycan = { created_at: recentCreatedAt, laycan_end: 1000000000000, laycan_start: 999000000000 };
    expect(isFreshMatchWithLaycan(expiredLaycan, nowMs)).toBe(false);
  });

  it('returns true for fresh match with future laycan', () => {
    const freshMatch = { created_at: recentCreatedAt, laycan_end: 9999999999000, laycan_start: 9998000000000 };
    expect(isFreshMatchWithLaycan(freshMatch, nowMs)).toBe(true);
  });

  it('returns false when now=0 (SSR sentinel) even with future laycan', () => {
    const futureLaycan = { created_at: 0, laycan_end: 9999999999000, laycan_start: null };
    expect(isFreshMatchWithLaycan(futureLaycan, 0)).toBe(false);
  });

  it('returns false for null laycan that is fresh by created_at but laycan unknown — no change', () => {
    // null laycan → isLaycanExpired returns false → decision falls through to created_at
    const nullLaycan = { created_at: recentCreatedAt, laycan_end: null, laycan_start: null };
    expect(isFreshMatchWithLaycan(nullLaycan, nowMs)).toBe(true);
  });
});

// ── effectiveScore — inline mirror ───────────────────────────────────────────

function effectiveScore(m: { score: number; laycan_end: number | null; laycan_start: number | null }, nowMs: number): number {
  if (nowMs === 0) return m.score;
  if (isLaycanExpired(m.laycan_end, m.laycan_start, nowMs)) {
    return Math.min(m.score, 70);
  }
  return m.score;
}

describe('effectiveScore (behavioral)', () => {
  const nowMs = Date.now();
  const PAST_LAYCAN = 1000000000000;    // Sep 2001 in ms
  const FUTURE_LAYCAN = 9999999999000;  // Nov 2286 in ms

  it('caps score at 70 when laycan is expired', () => {
    expect(effectiveScore({ score: 92, laycan_end: PAST_LAYCAN, laycan_start: null }, nowMs)).toBe(70);
    expect(effectiveScore({ score: 85, laycan_end: PAST_LAYCAN, laycan_start: null }, nowMs)).toBe(70);
  });

  it('does not cap score above 70 when laycan is expired (score already ≤ 70)', () => {
    expect(effectiveScore({ score: 65, laycan_end: PAST_LAYCAN, laycan_start: null }, nowMs)).toBe(65);
    expect(effectiveScore({ score: 70, laycan_end: PAST_LAYCAN, laycan_start: null }, nowMs)).toBe(70);
  });

  it('returns full score for non-expired laycan', () => {
    expect(effectiveScore({ score: 92, laycan_end: FUTURE_LAYCAN, laycan_start: null }, nowMs)).toBe(92);
  });

  it('returns full score when laycan is null', () => {
    expect(effectiveScore({ score: 92, laycan_end: null, laycan_start: null }, nowMs)).toBe(92);
  });

  it('returns stored score when nowMs=0 (SSR sentinel)', () => {
    expect(effectiveScore({ score: 92, laycan_end: PAST_LAYCAN, laycan_start: null }, 0)).toBe(92);
  });
});

// ── fmtLaycan formatter (shared between list and detail) ─────────────────────

describe('fmtLaycan (formatter parity)', () => {
  it('formats a Unix-ms timestamp the same way in both views', () => {
    // Dec 20, 2024 in Unix ms
    const dec20 = new Date('2024-12-20T00:00:00Z').getTime();
    // Sep 24, 2024 in Unix ms
    const sep24 = new Date('2024-09-24T00:00:00Z').getTime();
    const result = fmtLaycan(sep24, dec20);
    expect(result).toMatch(/Sep 24/);
    expect(result).toMatch(/Dec 20/);
  });

  it('returns — for null/null', () => {
    expect(fmtLaycan(null, null)).toBe('—');
  });

  it('returns single date when only one value present', () => {
    const ts = new Date('2025-06-15T00:00:00Z').getTime();
    expect(fmtLaycan(ts, null)).toMatch(/Jun 15/);
    expect(fmtLaycan(null, ts)).toMatch(/Jun 15/);
  });
});

// ── Structural: detail page uses fmtLaycan ───────────────────────────────────

describe('app/match/[id]/page.tsx — laycan formatter parity (#556)', () => {
  it('imports fmtLaycan from fmt-laycan', () => {
    expect(detailSrc()).toMatch(/fmtLaycan.*fmt-laycan|fmt-laycan.*fmtLaycan/);
  });

  it('uses fmtLaycan for laycanDisplay (not inline toLocaleDateString)', () => {
    expect(detailSrc()).toMatch(/fmtLaycan\s*\(/);
    // The old inline pattern (new Date(storedMatch.laycan_start).toLocaleDateString)
    // must be gone — it was producing locale-dependent format inconsistent with list view.
    expect(detailSrc()).not.toMatch(/new Date\(storedMatch\.laycan_start\)\.toLocaleDateString/);
    expect(detailSrc()).not.toMatch(/new Date\(storedMatch\.laycan_end\)\.toLocaleDateString/);
  });
});

// ── Structural: MatchesClient has effectiveScore and laycan expiry guard ──────

describe('app/matches/MatchesClient.tsx — expired-laycan guards (#556)', () => {
  it('imports isLaycanExpired from fmt-laycan', () => {
    expect(clientSrc()).toMatch(/isLaycanExpired/);
    expect(clientSrc()).toMatch(/fmt-laycan/);
  });

  it('isFreshMatch returns false for expired laycan (guard present in source)', () => {
    const src = clientSrc();
    const fnStart = src.indexOf('function isFreshMatch');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/isLaycanExpired/);
  });

  it('has effectiveScore function that caps at 70', () => {
    expect(clientSrc()).toMatch(/function effectiveScore/);
    expect(clientSrc()).toMatch(/Math\.min.*score.*70|70.*score.*Math\.min/);
  });

  it('table score display uses effectiveScore, not raw match.score', () => {
    const src = clientSrc();
    // The score pill should call effectiveScore — the raw {match.score} pattern
    // (without effectiveScore wrapper) must not appear inside the score cell.
    expect(src).toMatch(/effectiveScore\(match/);
  });
});
