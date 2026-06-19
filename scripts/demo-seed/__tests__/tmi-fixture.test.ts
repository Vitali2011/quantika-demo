/**
 * Tests for tmi-fixture.ts — deterministic TMI row generator for demo seed.
 */
import { buildTmiRows } from '../tmi-fixture';
import type { MarketIndexRow } from '@/lib/market/market-indices-repository';

const FROZEN_DATE = '2026-05-10';
const COUNT = 30;

describe('buildTmiRows', () => {
  let rows: MarketIndexRow[];

  beforeEach(() => {
    rows = buildTmiRows(FROZEN_DATE, COUNT);
  });

  it('returns exactly count rows', () => {
    expect(rows).toHaveLength(COUNT);
  });

  it('every value is in [12000, 13500] and finite', () => {
    for (const r of rows) {
      expect(Number.isFinite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(12000);
      expect(r.value).toBeLessThanOrEqual(13500);
    }
  });

  it('every row has index_name === "tmi"', () => {
    for (const r of rows) {
      expect(r.index_name).toBe('tmi');
    }
  });

  it('every row has unit === "USD/day"', () => {
    for (const r of rows) {
      expect(r.unit).toBe('USD/day');
    }
  });

  it('every row has source === "demo-seed"', () => {
    for (const r of rows) {
      expect(r.source).toBe('demo-seed');
    }
  });

  it('dates are consecutive daily ascending, last date === frozenDate', () => {
    const dates = rows.map((r) => r.index_date);
    // ascending order
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
    // last date is frozenDate
    expect(dates[dates.length - 1]).toBe(FROZEN_DATE);
    // consecutive daily: each pair differs by exactly 1 day
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T00:00:00Z');
      const curr = new Date(dates[i] + 'T00:00:00Z');
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    }
  });

  it('ids are unique and stable (tmi-<date> pattern)', () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rows) {
      expect(r.id).toBe(`tmi-${r.index_date}`);
    }
  });

  it('is deterministic — two calls produce equal output', () => {
    const rows2 = buildTmiRows(FROZEN_DATE, COUNT);
    expect(rows).toEqual(rows2);
  });

  it('values are centred near 12683 (mean within ±800)', () => {
    const mean = rows.reduce((s, r) => s + r.value, 0) / rows.length;
    expect(Math.abs(mean - 12683)).toBeLessThan(800);
  });

  it('headline (last / frozen-date row) === 12683 oracle', () => {
    // The displayed TMI benchmark is the LAST row (frozenDate). It MUST equal
    // the canonical 12683 oracle the broker compares TCE against — not the
    // series mean. (audit finding 16)
    const last = rows[rows.length - 1];
    expect(last.index_date).toBe(FROZEN_DATE);
    expect(last.value).toBe(12683);
  });

  it('series is not flattened — keeps oscillation amplitude', () => {
    const values = rows.map((r) => r.value);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(500);
  });
});
