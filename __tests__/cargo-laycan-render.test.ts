/**
 * Adversarial QA for cargo laycan render pipeline:
 * parseLaycan(raw, refYear) → fmtLaycan(startSec, endSec)
 *
 * Covers the raw-text fallback introduced in app/cargo/page.tsx (risk-override).
 * Ref year 2026 for determinism; mirrors CORPUS_REF_YEAR used by rebase-parsed.
 */
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { fmtLaycan } from '@/lib/utils/fmt-laycan';

const REF_YEAR = 2026;

function fmt(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = parseLaycan(raw, REF_YEAR);
  if (!parsed) return raw; // fallback: keep raw string (not "—")
  return fmtLaycan(
    Math.floor(parsed.start.getTime() / 1000),
    Math.floor(parsed.end.getTime() / 1000),
  );
}

describe('cargo laycan render — parse+format pipeline', () => {
  // ── Canonical ISO range (post-rebase format) ──────────────────────────────
  it('ISO range "2026-06-02 to 2026-06-09" → formatted', () => {
    expect(fmt('2026-06-02 to 2026-06-09')).toBe('Jun 2–Jun 9');
  });

  it('ISO range with dash separator "2026-06-02 - 2026-06-09" → formatted', () => {
    expect(fmt('2026-06-02 - 2026-06-09')).toBe('Jun 2–Jun 9');
  });

  // ── Stale year — phrase form ───────────────────────────────────────────────
  // "End June 2019": phraseSingle matches "End June" and uses refYear (2019 ignored).
  it('stale "End June 2019" → current-year end-June (phrase strips stale year)', () => {
    const result = fmt('End June 2019');
    // phraseSingle => end of June 2026
    expect(result).toMatch(/Jun\s+25.+Jun\s+30|Jun 2[5-9]/);
  });

  // "June 2019" bare month-year: parseLaycan returns null → fallback raw string, no crash.
  it('bare "June 2019" → graceful fallback (raw string, not crash, not "—")', () => {
    const result = fmt('June 2019');
    expect(result).toBe('June 2019'); // raw passthrough
    expect(result).not.toBe('—');
    expect(result).not.toBeNull();
  });

  // ── Abbreviated range without year ───────────────────────────────────────
  it('"Jun 2-9" → formatted using refYear', () => {
    const result = fmt('Jun 2-9');
    expect(result).toBe('Jun 2–Jun 9');
  });

  it('"15-25 Sep" → formatted using refYear', () => {
    const result = fmt('15-25 Sep');
    expect(result).toBe('Sep 15–Sep 25');
  });

  it('"Sep 15-25" → formatted using refYear', () => {
    const result = fmt('Sep 15-25');
    expect(result).toBe('Sep 15–Sep 25');
  });

  // ── Range with explicit year ──────────────────────────────────────────────
  it('"15-25 May 2026" → formatted', () => {
    const result = fmt('15-25 May 2026');
    expect(result).toBe('May 15–May 25');
  });

  // ── Single date ───────────────────────────────────────────────────────────
  it('single "15 Jun" → single-date format (start==end)', () => {
    const result = fmt('15 Jun');
    // parseLaycan uses single-day fallback → {start: Jun 15, end: Jun 15}
    // fmtLaycan(sec, sec) → "Jun 15–Jun 15"
    expect(result).toMatch(/Jun\s*15/);
  });

  it('single ISO "2026-06-15" → single-date format (start==end)', () => {
    const result = fmt('2026-06-15');
    expect(result).toMatch(/Jun\s*15/);
  });

  // ── Empty / null ─────────────────────────────────────────────────────────
  it('null laycan → null (renders "—" in UI)', () => {
    expect(fmt(null)).toBeNull();
  });

  it('empty string → null (renders "—" in UI)', () => {
    expect(fmt('')).toBeNull();
  });

  // ── Malformed — graceful, no crash ────────────────────────────────────────
  it('garbage "not a date at all" → graceful fallback, no crash', () => {
    expect(() => fmt('not a date at all')).not.toThrow();
    // parseLaycan returns null → raw string passthrough
    expect(fmt('not a date at all')).toBe('not a date at all');
  });

  it('"Cargo ready" → raw passthrough', () => {
    expect(fmt('Cargo ready')).toBe('Cargo ready');
  });

  it('"Spot" → single-date format (resolves to today)', () => {
    // parseLaycan('Spot') → parseVesselOpenDate → today. Not null, not crash.
    const result = fmt('Spot');
    expect(result).not.toBeNull();
    expect(result).not.toBe('Spot'); // was formatted
    expect(typeof result).toBe('string');
  });

  // ── fmtLaycan itself: "—" only for both-null ──────────────────────────────
  it('fmtLaycan(null, null) → "—"', () => {
    expect(fmtLaycan(null, null)).toBe('—');
  });

  it('fmtLaycan with valid timestamps produces month-day output', () => {
    const start = Math.floor(new Date('2026-06-02T00:00:00Z').getTime() / 1000);
    const end   = Math.floor(new Date('2026-06-09T00:00:00Z').getTime() / 1000);
    expect(fmtLaycan(start, end)).toBe('Jun 2–Jun 9');
  });
});
