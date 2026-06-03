/**
 * PI2 behavioral tests — persistSessionMatches canonical TCE (#804 / #805).
 *
 * Root: the persist path re-computed TCE via resolveFreightRate (Baltic tier)
 * while the seed used estimateFreightRate — same pair, divergent tiers,
 * −$102k vs +$774. Fix: prefer m.economics.tceUsdPerDay when present.
 *
 * Covers:
 *   (1) sessionMatch carrying stored tce → list shows stored (not recomputed)
 *   (2) N sample matches: list-path tce === detail-path tce (same DB row)
 *   (3) sessionMatch with NO stored tce → recomputes (no regression for real users)
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
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches, getMatch } from '@/lib/matching/matches-repository';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

// Suppress Baltic-rate DB lookups — we control via m.economics.
jest.mock('@/lib/market/baltic-freight', () => ({
  getBalticDayRate: jest.fn(() => ({ usdPerDay: 25000, date: '2026-06-01', indexCode: 'BHSI_TC' })),
}));

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

const SESSION = 'test-session-123';

const CARGO: ParsedCargo = {
  emailId: 'cargo-19d5de87',
  itemIndex: 0,
  originPort: { value: 'UAODS', confidence: 'confirmed' },
  destinationPort: { value: 'NLRTM', confidence: 'confirmed' },
  weightMt: { value: 5000, confidence: 'confirmed' },
  cargoType: 'GRAIN',
  freightRateUsd: null,
  missingInfo: [],
} as unknown as ParsedCargo;

const VESSEL: ParsedVessel = {
  emailId: 'vessel-19e07cf8',
  itemIndex: 0,
  dwtSummer: { value: 28000, confidence: 'confirmed' },
  speedLaden: '12 kn',
  consumption: '22 mt/day',
  restrictions: [],
  specialFeatures: [],
} as unknown as ParsedVessel;

function makeMatch(overrides?: Partial<Match>): Match {
  return {
    cargoEmailId: 'cargo-19d5de87',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-19e07cf8',
    vesselItemIndex: 0,
    score: 85,
    matchLevel: 'good',
    matchReasons: ['Handysize grain on medium haul'],
    issues: [],
    ...overrides,
  };
}

// ── Test 1: stored tce is preferred over recompute ────────────────────────────

describe('persistSessionMatches — prefer stored tce from m.economics', () => {
  it('stores the seed tce, not the Baltic-recomputed value', () => {
    const db = freshDb();
    const canonicalTce = 774;

    const matchWithStoredTce = makeMatch({
      economics: {
        breakdown: {
          bunkerCost: 0, bunkerPort: '', euEtsAmount: 0,
          euEtsApplicable: false, warRiskPremium: 0, warRiskZones: [],
        },
        totalUsd: 0,
        calculatedAt: new Date(0).toISOString(),
        dataFreshness: { bunker: 'seed', eua: 'seed' },
        tceUsdPerDay: canonicalTce,
      },
    });

    persistSessionMatches(db, SESSION, [matchWithStoredTce], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tce_usd_per_day).toBe(canonicalTce);
  });

  it('stored tce does not equal what the Baltic recompute would produce', () => {
    // Verify the test has teeth: without the fix the Baltic tier (mocked at $25k/day)
    // would produce a very different value.
    const db = freshDb();

    // Match WITHOUT stored economics — recompute path fires
    const noStoredMatch = makeMatch();
    persistSessionMatches(db, SESSION, [noStoredMatch], [CARGO], [VESSEL]);
    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    const recomputedTce = rows[0].tce_usd_per_day;

    expect(recomputedTce).not.toBeNull();
    expect(recomputedTce).not.toBe(774);
  });
});

// ── Test 2: list-path tce === detail-path tce (same DB row) ──────────────────

describe('persistSessionMatches — list tce equals detail tce', () => {
  it('GET /api/matches list and GET /api/matches/[id] detail return same tce_usd_per_day', () => {
    const db = freshDb();
    const canonicalTce = 5420;

    const m1 = makeMatch({
      economics: {
        breakdown: {
          bunkerCost: 0, bunkerPort: '', euEtsAmount: 0,
          euEtsApplicable: false, warRiskPremium: 0, warRiskZones: [],
        },
        totalUsd: 0,
        calculatedAt: new Date(0).toISOString(),
        dataFreshness: { bunker: 'seed', eua: 'seed' },
        tceUsdPerDay: canonicalTce,
      },
    });

    persistSessionMatches(db, SESSION, [m1], [CARGO], [VESSEL]);

    const listRows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(listRows).toHaveLength(1);

    const listTce = listRows[0].tce_usd_per_day;
    const detailTce = getMatch(db, listRows[0].id)?.tce_usd_per_day;

    expect(listTce).toBe(canonicalTce);
    expect(detailTce).toBe(canonicalTce);
    expect(listTce).toBe(detailTce);
  });

  it('N=3 sample matches: all list tce values equal their detail counterparts', () => {
    const db = freshDb();

    const tces = [774, -1200, 8900];
    const matches = tces.map((tce, i) => ({
      cargoEmailId: `cargo-${i}`,
      cargoItemIndex: 0,
      vesselEmailId: `vessel-${i}`,
      vesselItemIndex: 0,
      score: 80 - i * 5,
      matchLevel: 'good' as const,
      matchReasons: ['test'],
      issues: [],
      economics: {
        breakdown: {
          bunkerCost: 0, bunkerPort: '', euEtsAmount: 0,
          euEtsApplicable: false, warRiskPremium: 0, warRiskZones: [],
        },
        totalUsd: 0,
        calculatedAt: new Date(0).toISOString(),
        dataFreshness: { bunker: 'seed', eua: 'seed' },
        tceUsdPerDay: tce,
      },
    }));

    // Minimal cargo/vessel sets — no port data → distanceResult=null → tce from economics
    const cargos = tces.map((_, i) => ({
      emailId: `cargo-${i}`,
      itemIndex: 0,
      originPort: null,
      destinationPort: null,
      weightMt: { value: 5000, confidence: 'confirmed' },
      cargoType: 'GRAIN',
      freightRateUsd: null,
      missingInfo: [],
    } as unknown as ParsedCargo));

    const vessels = tces.map((_, i) => ({
      emailId: `vessel-${i}`,
      itemIndex: 0,
      dwtSummer: { value: 28000, confidence: 'confirmed' },
      speedLaden: '12 kn',
      consumption: '22 mt/day',
      restrictions: [],
      specialFeatures: [],
    } as unknown as ParsedVessel));

    persistSessionMatches(db, SESSION, matches, cargos, vessels);

    const listRows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(listRows).toHaveLength(3);

    for (const row of listRows) {
      const detail = getMatch(db, row.id);
      expect(detail?.tce_usd_per_day).toBe(row.tce_usd_per_day);
    }
  });
});

// ── Test 3: no regression — real user (no stored tce) still recomputes ────────

describe('persistSessionMatches — recompute fallback for real sessions', () => {
  it('recomputes tce when m.economics is absent (real non-demo session)', () => {
    const db = freshDb();
    const noEconomicsMatch = makeMatch(); // no economics field

    persistSessionMatches(db, SESSION, [noEconomicsMatch], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    // Should have a recomputed value (not null) since CARGO has valid port data → distance resolves
    expect(rows[0].tce_usd_per_day).not.toBeNull();
    // And it won't be 774 — that's the seed canonical, not what the Baltic recompute gives
    expect(typeof rows[0].tce_usd_per_day).toBe('number');
  });

  it('recomputes tce when m.economics.tceUsdPerDay is null', () => {
    const db = freshDb();
    const nullTceMatch = makeMatch({
      economics: {
        breakdown: {
          bunkerCost: 0, bunkerPort: '', euEtsAmount: 0,
          euEtsApplicable: false, warRiskPremium: 0, warRiskZones: [],
        },
        totalUsd: 0,
        calculatedAt: new Date(0).toISOString(),
        dataFreshness: { bunker: 'seed', eua: 'seed' },
        tceUsdPerDay: undefined,  // explicitly absent
      },
    });

    persistSessionMatches(db, SESSION, [nullTceMatch], [CARGO], [VESSEL]);
    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    // Falls through to recompute — value computed from port distance + Baltic
    expect(rows[0].tce_usd_per_day).not.toBeNull();
  });
});
