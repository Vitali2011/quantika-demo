/**
 * tmi-fixture.ts — deterministic TMI series for demo-seed.
 *
 * Generates `count` daily rows ending at `frozenDate`, values centred near
 * 12683 USD/day using a deterministic sine formula — no Math.random(), no
 * Date.now() baked into values. Re-seeding is idempotent via the
 * upsertIndex ON CONFLICT(index_name, index_date) constraint.
 */

import type { MarketIndexRow } from '@/lib/market/market-indices-repository';

/**
 * Build an array of `count` consecutive daily TMI rows.
 * Dates run from (frozenDate - count + 1) to frozenDate (inclusive), ascending.
 * value = round(12683 + 600*sin(i*0.5) + 120*((i%5)-2)), clamped to [12000,13500].
 * fetched_at is frozenDate + 'T12:00:00.000Z'.
 */
export function buildTmiRows(frozenDate: string, count = 30): MarketIndexRow[] {
  const end = new Date(frozenDate + 'T00:00:00Z');
  const fetchedAt = frozenDate + 'T12:00:00.000Z';
  const rows: MarketIndexRow[] = [];

  for (let i = 0; i < count; i++) {
    // i=0 is the earliest date, i=count-1 is frozenDate
    const dayOffset = count - 1 - i;
    const date = new Date(end.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const isoDate = date.toISOString().slice(0, 10);

    const raw = 12683 + 600 * Math.sin(i * 0.5) + 120 * ((i % 5) - 2);
    const value = Math.round(Math.max(12000, Math.min(13500, raw)));

    rows.push({
      id: `tmi-${isoDate}`,
      index_name: 'tmi',
      index_date: isoDate,
      value,
      unit: 'USD/day',
      source: 'demo-seed',
      fetched_at: fetchedAt,
    });
  }

  return rows;
}
