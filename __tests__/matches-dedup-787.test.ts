/**
 * #787 — dedupMatches: dedup by economic identity, not paraphrased cargo_ref.
 *
 * Two rows with the same vessel+cargo_type+load_port+discharge_port+laycan_start+laycan_end+fit_percent
 * but different cargo_ref text must collapse to one.
 * Rows differing in any discriminator (discharge_port, cargo_type, laycan_start,
 * vessel_name, fit_percent) must NOT collapse (no over-collapse regression).
 * fit_percent added after prod-data analysis showed 17 same-route rows with different
 * fit values (genuinely distinct matches) were being wrongly merged.
 */

import { dedupMatches } from '../app/matches/page';
import type { StoredMatch } from '@/lib/matching/matches-repository';

function makeRow(overrides: Partial<StoredMatch> & { id: number }): StoredMatch {
  return {
    id: overrides.id,
    user_id: 'u1',
    cargo_id: overrides.cargo_id ?? 'c1',
    vessel_id: overrides.vessel_id ?? 'v1',
    cargo_item_index: null,
    vessel_item_index: null,
    score: 80,
    reason: '',
    reason_structured: null,
    status: 'shortlist',
    created_at: 1748908800,
    updated_at: 1748908800,
    vessel_name: overrides.vessel_name ?? 'MV ALPHA',
    cargo_type: overrides.cargo_type ?? 'grain',
    load_port: overrides.load_port ?? 'UAODS',
    discharge_port: overrides.discharge_port ?? 'CNSHA',
    laycan_start: overrides.laycan_start ?? 1748908800000,
    laycan_end: overrides.laycan_end ?? null,
    cargo_ref: overrides.cargo_ref ?? null,
    vessel_dwt: null,
    freight_rate_usd_per_mt: null,
    freight_rate_source: null,
    distance_nm: null,
    tce_usd_per_day: null,
    consumption_estimated: null,
    fit_percent: overrides.fit_percent ?? null,
    fit_breakdown: null,
    worksheet_json: null,
    breakeven_tce_usd_per_day: null,
  } as StoredMatch;
}

describe('dedupMatches — economic identity key (#787)', () => {
  it('collapses two rows with same economic identity but paraphrased cargo_ref', () => {
    const rows = [
      makeRow({ id: 1, cargo_ref: 'max 2 tiers' }),
      makeRow({ id: 2, cargo_ref: 'tier limit 2' }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1); // first-wins
  });

  it('keeps rows that differ in discharge_port (no over-collapse)', () => {
    const rows = [
      makeRow({ id: 1, discharge_port: 'CNSHA' }),
      makeRow({ id: 2, discharge_port: 'CNNGB' }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps rows that differ in cargo_type (no over-collapse)', () => {
    const rows = [
      makeRow({ id: 1, cargo_type: 'grain' }),
      makeRow({ id: 2, cargo_type: 'coal' }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps rows that differ in laycan_start (no over-collapse)', () => {
    const rows = [
      makeRow({ id: 1, laycan_start: 1748908800000 }),
      makeRow({ id: 2, laycan_start: 1749000000000 }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps rows that differ in vessel_name (no over-collapse)', () => {
    const rows = [
      makeRow({ id: 1, vessel_name: 'MV ALPHA' }),
      makeRow({ id: 2, vessel_name: 'MV BETA' }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(2);
  });

  it('handles null fields gracefully (uses empty string for null)', () => {
    const rows = [
      makeRow({ id: 1, vessel_name: null, cargo_type: null, load_port: null, discharge_port: null, laycan_start: null }),
      makeRow({ id: 2, vessel_name: null, cargo_type: null, load_port: null, discharge_port: null, laycan_start: null }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(1);
  });

  it('keeps rows with same economic identity that differ only in load_port', () => {
    const rows = [
      makeRow({ id: 1, load_port: 'UAODS' }),
      makeRow({ id: 2, load_port: 'EGPSD' }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps rows identical except for different fit_percent (no over-collapse)', () => {
    // Prod data: 17 rows with same vessel/cargo_type/route/laycan but different fit_percent —
    // these are genuinely distinct matches and must not be merged.
    const rows = [
      makeRow({ id: 1, vessel_name: 'SEAGULL', cargo_type: 'grain', load_port: 'UAODS', discharge_port: 'CNSHA', laycan_start: 1748908800000, laycan_end: 1749081600000, fit_percent: 61.2 }),
      makeRow({ id: 2, vessel_name: 'SEAGULL', cargo_type: 'grain', load_port: 'UAODS', discharge_port: 'CNSHA', laycan_start: 1748908800000, laycan_end: 1749081600000, fit_percent: 74.5 }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(2);
  });

  it('collapses rows with same route/laycan AND same fit_percent (true re-circulated dup)', () => {
    // e.g. SEAGULL 60 appearing twice with same fit_percent 61.2 — these ARE true dups
    const rows = [
      makeRow({ id: 1, cargo_ref: 'grain shipment A', vessel_name: 'SEAGULL', fit_percent: 61.2, laycan_end: 1749081600000 }),
      makeRow({ id: 2, cargo_ref: 'grain shipment B', vessel_name: 'SEAGULL', fit_percent: 61.2, laycan_end: 1749081600000 }),
    ];
    const result = dedupMatches(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});
