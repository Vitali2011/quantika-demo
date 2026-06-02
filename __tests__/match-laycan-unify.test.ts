/**
 * Regression tests — laycan-unify: all renders on /match/[id] derive from ONE unified value.
 *
 * Original bug (#745): storedMatch.laycan_start/end == null → laycanDisplay was null →
 *   header/cargo-card showed nothing while Source Attribution fell back to raw
 *   cargo.preferredDates ("Jan 19-Apr 7"), mismatching the worksheet Time row
 *   which showed the computed window ("2026-06-03 – 2026-06-06").
 *
 * Second fix: even when storedMatch.laycan_start/end is SET (stale original), CARGO card
 *   showed the stale date while worksheet Time row showed the rebased readiness window.
 *   Fix: worksheet readiness wins — precedence order now readiness > storedMatch > preferredDates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fmtLaycan } from '@/lib/utils/fmt-laycan';

const ROOT = process.cwd();
const detailSrc = () => fs.readFileSync(path.join(ROOT, 'app/match/[id]/page.tsx'), 'utf8');

// ── Behavioral: worksheet laycanStart/End → fmtLaycan roundtrip ─────────────

describe('worksheet readiness laycan → fmtLaycan roundtrip (behavioral)', () => {
  it('converts ISO laycanStart/End to fmtLaycan-compatible Unix timestamps', () => {
    const isoStart = '2026-06-03';
    const isoEnd = '2026-06-06';
    const toTs = (iso: string) => Math.floor(new Date(iso + 'T00:00:00Z').getTime() / 1000);
    const result = fmtLaycan(toTs(isoStart), toTs(isoEnd));
    expect(result).toMatch(/Jun 3/);
    expect(result).toMatch(/Jun 6/);
  });

  it('single ISO date round-trips correctly', () => {
    const toTs = (iso: string) => Math.floor(new Date(iso + 'T00:00:00Z').getTime() / 1000);
    expect(fmtLaycan(toTs('2026-06-03'), null)).toMatch(/Jun 3/);
    expect(fmtLaycan(null, toTs('2026-06-06'))).toMatch(/Jun 6/);
  });

  it('fmtLaycan(null, null) returns — sentinel (not empty string)', () => {
    expect(fmtLaycan(null, null)).toBe('—');
  });
});

// ── Structural: page.tsx fallback chain ─────────────────────────────────────

describe('app/match/[id]/page.tsx — laycan unified fallback chain (#laycan-unify)', () => {
  it('derives laycanDisplay via IIFE with tiered fallback', () => {
    const src = detailSrc();
    expect(src).toMatch(/laycanDisplay\s*=\s*\(\s*\(\s*\)\s*=>/);
  });

  it('first/wins tier: worksheet readiness laycanStart/End via fmtLaycan', () => {
    const src = detailSrc();
    expect(src).toMatch(/worksheet\?\.readiness\?\.laycanStart/);
    expect(src).toMatch(/worksheet\?\.readiness\?\.laycanEnd/);
    // must convert ISO to timestamp and call fmtLaycan
    expect(src).toMatch(/toTs\s*=.*new Date\(iso/);
    expect(src).toMatch(/fmtLaycan\(rs\s*\?.*toTs/);
  });

  it('second/fallback tier: storedMatch.laycan_start / laycan_end via fmtLaycan', () => {
    const src = detailSrc();
    expect(src).toMatch(/storedMatch\.laycan_start.*storedMatch\.laycan_end|storedMatch\.laycan_end.*storedMatch\.laycan_start/);
    expect(src).toMatch(/fmtLaycan\(storedMatch\.laycan_start,\s*storedMatch\.laycan_end\)/);
  });

  it('worksheet readiness check appears BEFORE storedMatch check in source (precedence)', () => {
    const src = detailSrc();
    const readinessIdx = src.indexOf('worksheet?.readiness?.laycanStart');
    const storedMatchIdx = src.indexOf('fmtLaycan(storedMatch.laycan_start');
    expect(readinessIdx).toBeGreaterThan(0);
    expect(storedMatchIdx).toBeGreaterThan(0);
    expect(readinessIdx).toBeLessThan(storedMatchIdx);
  });

  it('third tier: cargo.preferredDates.value', () => {
    const src = detailSrc();
    expect(src).toMatch(/cargo\?\.preferredDates\?\.value/);
  });

  it('worksheet is parsed BEFORE laycanDisplay so fallback has access to it', () => {
    const src = detailSrc();
    const worksheetIdx = src.indexOf('worksheet = JSON.parse(storedMatch.worksheet_json)');
    const laycanIdx = src.indexOf('laycanDisplay = (');
    expect(worksheetIdx).toBeGreaterThan(0);
    expect(laycanIdx).toBeGreaterThan(0);
    expect(worksheetIdx).toBeLessThan(laycanIdx);
  });

  it('worksheet block is not duplicated', () => {
    const src = detailSrc();
    const count = (src.match(/worksheet = JSON\.parse\(storedMatch\.worksheet_json\)/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ── Behavioral: laycanDisplay precedence (#laycan-precedence) ────────────────
// Mirrors the laycanDisplay IIFE logic to verify precedence without hitting Next.js server infra.

describe('laycanDisplay precedence — behavioral (#laycan-precedence)', () => {
  const toTs = (iso: string) => Math.floor(new Date(iso + 'T00:00:00Z').getTime() / 1000);

  function computeLaycanDisplay(
    storedMatch: { laycan_start: number | null; laycan_end: number | null },
    worksheet: { readiness?: { laycanStart?: string; laycanEnd?: string } } | null,
    cargo: { preferredDates?: { value?: string } } | undefined,
  ): string | null {
    const rs = worksheet?.readiness?.laycanStart;
    const re = worksheet?.readiness?.laycanEnd;
    if (rs || re) {
      return fmtLaycan(rs ? toTs(rs) : null, re ? toTs(re) : null);
    }
    if (storedMatch.laycan_start || storedMatch.laycan_end) {
      return fmtLaycan(storedMatch.laycan_start, storedMatch.laycan_end);
    }
    if (cargo?.preferredDates?.value) {
      return cargo.preferredDates.value;
    }
    return null;
  }

  it('worksheet readiness wins over storedMatch when both present with different dates', () => {
    const result = computeLaycanDisplay(
      { laycan_start: toTs('2026-01-19'), laycan_end: toTs('2026-04-07') }, // stale original
      { readiness: { laycanStart: '2026-06-03', laycanEnd: '2026-06-06' } }, // rebased window
      undefined,
    );
    expect(result).toMatch(/Jun 3/);
    expect(result).toMatch(/Jun 6/);
    expect(result).not.toMatch(/Jan 19/);
    expect(result).not.toMatch(/Apr 7/);
  });

  it('falls back to storedMatch when worksheet has no readiness', () => {
    const result = computeLaycanDisplay(
      { laycan_start: toTs('2026-01-19'), laycan_end: toTs('2026-04-07') },
      null,
      undefined,
    );
    expect(result).toMatch(/Jan 19/);
    expect(result).toMatch(/Apr 7/);
  });

  it('falls back to storedMatch when worksheet.readiness exists but has no dates', () => {
    const result = computeLaycanDisplay(
      { laycan_start: toTs('2026-01-19'), laycan_end: toTs('2026-04-07') },
      { readiness: {} },
      undefined,
    );
    expect(result).toMatch(/Jan 19/);
  });

  it('falls back to cargo.preferredDates when neither worksheet readiness nor storedMatch', () => {
    const result = computeLaycanDisplay(
      { laycan_start: null, laycan_end: null },
      { readiness: {} },
      { preferredDates: { value: 'early July' } },
    );
    expect(result).toBe('early July');
  });

  it('returns null when nothing available', () => {
    const result = computeLaycanDisplay(
      { laycan_start: null, laycan_end: null },
      null,
      undefined,
    );
    expect(result).toBeNull();
  });
});
