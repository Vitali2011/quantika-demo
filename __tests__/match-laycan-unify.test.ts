/**
 * Regression tests — laycan-unify: all renders on /match/[id] derive from ONE unified value.
 *
 * Bug: storedMatch.laycan_start/end == null → laycanDisplay was null →
 *   header/cargo-card showed nothing while Source Attribution fell back to raw
 *   cargo.preferredDates ("Jan 19-Apr 7"), mismatching the worksheet Time row
 *   which showed the computed window ("2026-06-03 – 2026-06-06").
 *
 * Fix: laycanDisplay falls back to worksheet.readiness.laycanStart/End (parsed via
 *   fmtLaycan), then to cargo.preferredDates.value. All renders use laycanDisplay.
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

  it('first tier: storedMatch.laycan_start / laycan_end via fmtLaycan', () => {
    const src = detailSrc();
    expect(src).toMatch(/storedMatch\.laycan_start.*storedMatch\.laycan_end|storedMatch\.laycan_end.*storedMatch\.laycan_start/);
    expect(src).toMatch(/fmtLaycan\(storedMatch\.laycan_start,\s*storedMatch\.laycan_end\)/);
  });

  it('second tier: worksheet readiness laycanStart/End via fmtLaycan', () => {
    const src = detailSrc();
    expect(src).toMatch(/worksheet\?\.readiness\?\.laycanStart/);
    expect(src).toMatch(/worksheet\?\.readiness\?\.laycanEnd/);
    // must convert ISO to timestamp and call fmtLaycan
    expect(src).toMatch(/toTs\s*=.*new Date\(iso/);
    expect(src).toMatch(/fmtLaycan\(rs\s*\?.*toTs/);
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
