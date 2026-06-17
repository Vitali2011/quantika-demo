/**
 * Behavioral tests for Task 6 (#819): seed persists freight_rate_usd_per_mt + freight_rate_source.
 * Tests buildMatchEconomics returns the freight fields so writeBucket can persist them.
 *
 * Also covers regen worksheet passport (#958/#959): buildWorksheet carries full hardFilters,
 * sanctions, bucketReason, and breakeven_tce_usd_per_day.
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import migration045 from '@/lib/migrations/045-matches-worksheet';
import migration046 from '@/lib/migrations/046-matches-consumption-estimated';
import migration047 from '@/lib/migrations/047-matches-ballast-distance';
import migration050 from '@/lib/migrations/050-matches-breakeven';
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';
import { listMatches, createMatch } from '@/lib/matching/matches-repository';
import { buildWorksheet } from '@/scripts/demo-seed/regenerate-matches';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  migration044.up(db);
  migration045.up(db);
  return db;
}

describe('buildMatchEconomics — freight rate persisted for seed (#819 Task 6)', () => {
  test('returns freightRateUsdPerMt and freightRateSource alongside tceUsdPerDay', () => {
    const result = buildMatchEconomics({
      cargoType: 'GRAIN',
      distanceNm: 400,
      vesselDwt: 3000,
      quantityMt: 2500,
      speedKts: 12,
      consumptionMt: 8,
      loadPort: 'marmara',
      dischargePort: 'constanta',
      calculatedAt: new Date(0).toISOString(),
      resolvedFreight: { rate: 25.2, source: 'estimated', confidence: 0.6 },
    });
    expect(result).not.toBeNull();
    expect(result!.freightRateUsdPerMt).toBe(25.2);
    expect(result!.freightRateSource).toBe('estimated');
    expect(result!.tceUsdPerDay).toBeGreaterThan(0);
  });

  test('persisted match row has non-null freight_rate_usd_per_mt via createMatch', () => {
    const db = freshDb();
    try {
      createMatch(db, {
        cargo_id: 'cargo-1', vessel_id: 'vessel-1', cargo_item_index: 0, vessel_item_index: 0,
        score: 80, reason: 'test', status: 'shortlist', user_id: null,
        tce_usd_per_day: 1234, distance_nm: 400,
        freight_rate_usd_per_mt: 25.2, freight_rate_source: 'estimated',
        vessel_name: null, cargo_ref: null, fit_percent: null, fit_breakdown: null,
      });
      const rows = listMatches(db, { user_id: null, sortBy: 'score', sortDir: 'desc' });
      expect(rows).toHaveLength(1);
      expect(rows[0].freight_rate_usd_per_mt).toBe(25.2);
      expect(rows[0].freight_rate_source).toBe('estimated');
    } finally {
      db.close();
    }
  });
});

// ── Regen worksheet passport (#958/#959) ─────────────────────────────────────

const BASE_READINESS = {
  openDate: '2026-06-09',
  laycanStart: '2026-06-15',
  laycanEnd: '2026-06-20',
  distanceNm: 400,
  distanceExact: true,
  speedKn: 12,
  sailingDays: 1.4,
  arrivalDate: '2026-06-10',
  gapDays: 5,
  verdict: 'ideal' as const,
  explanation: 'arrives in window',
};

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'cargo-1',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-1',
    vesselItemIndex: 0,
    score: 85,
    matchLevel: 'good',
    matchReasons: [],
    issues: [],
    readiness: BASE_READINESS,
    hardFilters: {
      draft: { pass: true },
      crane: { pass: false, reason: 'crane required' },
      volume: { pass: true },
      cargoVessel: { pass: true },
      destDraft: { pass: true },
      destCrane: { pass: true },
      cargoWeight: { pass: true },
      imsbc: { pass: true },
    },
    sanctions: { risk: 'LOW', blocking: false },
    economics: {
      tceUsdPerDay: 6500,
      freightRateUsdPerMt: 28,
      freightRateSource: 'index',
      breakdown: {} as never,
      totalUsd: 0,
      calculatedAt: '2026-06-11T00:00:00.000Z',
      dataFreshness: { bunker: '2026-06-11T00:00:00.000Z', eua: '2026-06-11T00:00:00.000Z' },
    },
    ...overrides,
  };
}

describe('buildWorksheet — full filter passport (#958/#959)', () => {
  test('carries all hardFilter gates beyond draft/crane/volume', () => {
    const ws = buildWorksheet(makeMatch(), undefined, undefined);
    expect(ws).not.toBeNull();
    expect(ws!.hardFilters.draft).toEqual({ pass: true });
    expect(ws!.hardFilters.crane).toEqual({ pass: false, reason: 'crane required' });
    expect(ws!.hardFilters.cargoVessel).toEqual({ pass: true });
    expect(ws!.hardFilters.destDraft).toEqual({ pass: true });
    expect(ws!.hardFilters.destCrane).toEqual({ pass: true });
    expect(ws!.hardFilters.cargoWeight).toEqual({ pass: true });
    expect(ws!.hardFilters.imsbc).toEqual({ pass: true });
  });

  test('carries sanctions from match', () => {
    const ws = buildWorksheet(makeMatch(), undefined, undefined);
    expect(ws!.sanctions).toEqual({ risk: 'LOW', blocking: false });
  });

  test('bucketReason is present and has bucket + reason', () => {
    const ws = buildWorksheet(makeMatch(), undefined, undefined);
    expect(ws!.bucketReason).toBeDefined();
    expect(ws!.bucketReason!.bucket).toBeDefined();
    expect(typeof ws!.bucketReason!.reason).toBe('string');
  });

  test('no readiness → returns null', () => {
    const ws = buildWorksheet(makeMatch({ readiness: undefined }), undefined, undefined);
    expect(ws).toBeNull();
  });

  test('missing hardFilters → falls back to pass:true defaults for all required gates', () => {
    const ws = buildWorksheet(makeMatch({ hardFilters: undefined }), undefined, undefined);
    expect(ws!.hardFilters.draft).toEqual({ pass: true });
    expect(ws!.hardFilters.crane).toEqual({ pass: true });
    expect(ws!.hardFilters.volume).toEqual({ pass: true });
    expect(ws!.hardFilters.cargoVessel).toEqual({ pass: true });
  });
});

describe('buildWorksheet — cargo data-truth fields flow through (#1021 #1023)', () => {
  const cargoWithNewFields = {
    emailId: 'cargo-1',
    itemIndex: 0,
    weightMt: { value: 5000, confidence: 'confirmed', sourceText: '5.000/5.500mts' },
    weightMtMin: 5000,
    weightMtMax: 5500,
    volumeCbm: 12000,
    minVesselDwtMt: 12000,
    maxVesselDwtMt: 14000,
    cargoType: 'GENERAL',
    originPort: { value: 'Marmara', confidence: 'confirmed', sourceText: 'marmara' },
    destinationPort: { value: 'Veracruz', confidence: 'confirmed', sourceText: 'veracruz' },
  } as unknown as ParsedCargo;

  test('volumeCbm / minVesselDwtMt / maxVesselDwtMt propagate from cargo into worksheet.cargo', () => {
    const ws = buildWorksheet(makeMatch(), cargoWithNewFields, undefined);
    expect(ws).not.toBeNull();
    expect(ws!.cargo.volumeCbm).toBe(12000);
    expect(ws!.cargo.minVesselDwtMt).toBe(12000);
    expect(ws!.cargo.maxVesselDwtMt).toBe(14000);
  });

  test('absent cargo → new fields null (no crash)', () => {
    const ws = buildWorksheet(makeMatch(), undefined, undefined);
    expect(ws!.cargo.volumeCbm).toBeNull();
    expect(ws!.cargo.minVesselDwtMt).toBeNull();
    expect(ws!.cargo.maxVesselDwtMt).toBeNull();
  });
});

describe('breakeven_tce_usd_per_day — persisted via createMatch (#959)', () => {
  function freshDbWithBreakeven(): Database.Database {
    const db = new Database(':memory:');
    migration032.up(db);
    migration033.up(db);
    migration034.up(db);
    migration035.up(db);
    migration036.up(db);
    migration041.up(db);
    migration042.up(db);
    migration044.up(db);
    migration045.up(db);
    migration046.up(db);
    migration047.up(db);
    migration050.up(db);
    return db;
  }

  test('createMatch persists breakeven_tce_usd_per_day and listMatches returns it', () => {
    const db = freshDbWithBreakeven();
    try {
      createMatch(db, {
        cargo_id: 'cargo-1', vessel_id: 'vessel-1', cargo_item_index: 0, vessel_item_index: 0,
        score: 80, reason: 'test', status: 'shortlist', user_id: null,
        tce_usd_per_day: 6500, distance_nm: 400,
        freight_rate_usd_per_mt: 28, freight_rate_source: 'index',
        vessel_name: null, cargo_ref: null, fit_percent: 82, fit_breakdown: null,
        breakeven_tce_usd_per_day: 5500,
      });
      const rows = listMatches(db, { user_id: null, sortBy: 'score', sortDir: 'desc' });
      expect(rows).toHaveLength(1);
      expect((rows[0] as unknown as Record<string, unknown>).breakeven_tce_usd_per_day).toBe(5500);
    } finally {
      db.close();
    }
  });
});
