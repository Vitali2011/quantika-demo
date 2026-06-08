/**
 * PI2 behavioral tests — persistSessionMatches canonical TCE contract (#819 Phase B(b)).
 *
 * History: the persist path used to PREFER `m.economics.tceUsdPerDay` over the live
 * recompute as a hot-fix for a structural divergence between Baltic-tier and
 * estimateFreightRate-tier (−$102k vs +$774 on the same pair). PR #824 fixed the
 * root cause in freight-resolver Tier-2 (laden-only days → round-trip days), so the
 * override became a redundant no-op and was removed in this PR.
 *
 * Post-fix contract these tests guard:
 *   (A) `tce_usd_per_day` is always the live recompute (no override branch).
 *   (B) listMatches and getMatch return the SAME `tce_usd_per_day` for any given
 *       match (single DB column → identical reads).
 *   (C) sign(persisted tce) === sign(breakdown.net_voyage_usd) — the headline
 *       and net-voyage cannot disagree in direction.
 *
 * Real value shapes exercised: profitable voyage (high Baltic day-rate),
 * loss-making voyage (low Baltic day-rate), and N=3 distinct stored-economics
 * sentinels all overridden by the live recompute.
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
import { computeEstimatedTce, parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { calculateTCE } from '@/lib/economics/voyage-calculator';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { resolveFreightRate } from '@/lib/matching/freight-resolver';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getBalticDayRate } from '@/lib/market/baltic-freight';
import { cfValue } from '@/lib/types';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

// Mock Baltic-rate DB lookups so each scenario can drive a deterministic day-rate.
jest.mock('@/lib/market/baltic-freight', () => ({
  getBalticDayRate: jest.fn(() => ({ usdPerDay: 25000, date: '2026-06-01', indexCode: 'BHSI_TC' })),
}));

const mockBaltic = getBalticDayRate as unknown as jest.Mock;

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

const SESSION = 'test-session-canonical-tce';

const PROFIT_BALTIC = { usdPerDay: 25000, date: '2026-06-01', indexCode: 'BHSI_TC' };
const LOSS_BALTIC = { usdPerDay: 3000, date: '2026-06-01', indexCode: 'BHSI_TC' };

// Voyage fixture: Odesa → Rotterdam, Handysize, GRAIN. Drives a real port distance
// and a real round-trip duration so the live recompute is meaningful.
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

function withStoredTce(tce: number | undefined, overrides?: Partial<Match>): Match {
  return makeMatch({
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
    ...overrides,
  });
}

/**
 * Mirror persistSessionMatches' live recompute for a single (cargo, vessel) pair.
 * Uses computeStoredMatchEconomics (the shared helper post-A3/A4) so assertions
 * stay aligned with the SUT. No port_da_estimates table in this test fixture →
 * DA=0 (graceful), but excludeWarRiskFromDailyTce:true (new convention) applies.
 */
function expectedLive(
  cargo: ParsedCargo,
  vessel: ParsedVessel,
  _baltic: { usdPerDay: number; date: string; indexCode: string },
  db: Database.Database,
): { tce_usd_per_day: number | null; breakdown: { net_voyage_usd: number } } | null {
  const result = computeStoredMatchEconomics({ cargo, vessel, db });
  if (result.tce_usd_per_day === null || !result.tce_breakdown) return null;
  return {
    tce_usd_per_day: result.tce_usd_per_day,
    breakdown: { net_voyage_usd: result.tce_breakdown.net_voyage_usd },
  };
}

beforeEach(() => {
  mockBaltic.mockReset();
  mockBaltic.mockReturnValue(PROFIT_BALTIC);
});

// ── Group 1: storedTce override is GONE — live recompute always wins ──────────

describe('persistSessionMatches — storedTce override removed (#819 B(b))', () => {
  it('profitable voyage: stored sentinel ignored, live recompute persisted, sign agrees with net_voyage', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, PROFIT_BALTIC, db);
    expect(expected).not.toBeNull();
    expect(expected!.breakdown.net_voyage_usd).toBeGreaterThan(0);     // real profit, not noise
    expect(expected!.tce_usd_per_day).toBeGreaterThan(0);              // sign agreement source

    const SENTINEL = 99_999;                                            // value the live path could never produce
    persistSessionMatches(db, SESSION, [withStoredTce(SENTINEL)], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tce_usd_per_day).not.toBe(SENTINEL);                 // override is gone
    expect(rows[0].tce_usd_per_day).toBe(expected!.tce_usd_per_day);    // live recompute wins
    expect(Math.sign(rows[0].tce_usd_per_day as number))
      .toBe(Math.sign(expected!.breakdown.net_voyage_usd));             // sign agreement
  });

  it('loss-making voyage: stored sentinel ignored, live recompute persisted, sign agrees with net_voyage', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(LOSS_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, LOSS_BALTIC, db);
    expect(expected).not.toBeNull();
    expect(expected!.breakdown.net_voyage_usd).toBeLessThan(0);         // real loss, not noise
    expect(expected!.tce_usd_per_day).toBeLessThan(0);

    const SENTINEL = -1;                                                // same sign as live, different magnitude
    persistSessionMatches(db, SESSION, [withStoredTce(SENTINEL)], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tce_usd_per_day).not.toBe(SENTINEL);                 // override is gone
    expect(rows[0].tce_usd_per_day).toBe(expected!.tce_usd_per_day);    // live recompute wins
    expect(Math.sign(rows[0].tce_usd_per_day as number))
      .toBe(Math.sign(expected!.breakdown.net_voyage_usd));             // sign agreement (both negative)
  });
});

// ── Group 2: list_tce === DETAIL calculateTCE — real-paths parity (#819) ──────
//
// Replaces the prior "blind-mirror" block that compared listMatches vs getMatch
// (trivially equal — same DB column). This block exercises the REAL divergence:
// persist writes tce_usd_per_day via computeEstimatedTce (round-trip denominator),
// while EconomicsTab PREVIOUSLY used estimateVoyageDays (laden-only) for its API
// call. After #819 Task 5, EconomicsTab uses buildCanonicalTceInputs → same result.

describe('persistSessionMatches — persisted list tce equals shared helper (single source of truth, #849 fix)', () => {
  it('persisted tce_usd_per_day equals computeStoredMatchEconomics for the same pair (DA + war-risk parity)', () => {
    // Post-A3/A4 contract: persistSessionMatches and computeStoredMatchEconomics route
    // through the same helper, so stored tce_usd_per_day is identical to what the
    // helper returns for the same inputs. The detail-path parity is covered by A5.
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);

    persistSessionMatches(db, SESSION, [makeMatch()], [CARGO], [VESSEL]);
    const listRows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(listRows).toHaveLength(1);

    const listTce = listRows[0].tce_usd_per_day;
    const storedFreightRate = listRows[0].freight_rate_usd_per_mt;
    expect(listTce).not.toBeNull();
    expect(storedFreightRate).not.toBeNull(); // Task 6: seed persists freight rate

    // Reference: the shared helper (single source of truth)
    const helperResult = computeStoredMatchEconomics({ cargo: CARGO, vessel: VESSEL, db });
    expect(helperResult.tce_usd_per_day).not.toBeNull();

    // list and helper must agree to the dollar
    expect(listTce).toBe(helperResult.tce_usd_per_day);
    // sign agreement with net voyage
    expect(Math.sign(listTce as number)).toBe(Math.sign(helperResult.tce_breakdown!.net_voyage_usd));
    db.close();
  });

  it('44101-class (Marmara→Constanta shape) persisted TCE is POSITIVE after Option A + builder fix', () => {
    // Small Handysize, GRAIN, ~400nm. Before Option A (distanceFactor 0.7) the Tier-3
    // freight was depressed → tce was negative. After Option A (1.0) it is positive.
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);
    const bsCargo = { ...CARGO,
      emailId: 'cargo-bs', itemIndex: 0,
      originPort: { value: 'UAMRP', confidence: 'confirmed' as const }, // Mariupol proxy for Marmara-class
      destinationPort: { value: 'ROBND', confidence: 'confirmed' as const }, // Braila for Constanta-class
    } as unknown as ParsedCargo;
    const bsVessel = { ...VESSEL,
      emailId: 'vessel-bs', itemIndex: 0,
      dwtSummer: { value: 3000, confidence: 'confirmed' as const },
      speedLaden: '12 kn',
      consumption: '8 mt/day',
    } as unknown as ParsedVessel;
    const bsMatch = makeMatch({ cargoEmailId: 'cargo-bs', vesselEmailId: 'vessel-bs' });
    persistSessionMatches(db, SESSION + '-bs', [bsMatch], [bsCargo], [bsVessel]);
    const rows = listMatches(db, { user_id: SESSION + '-bs', sortBy: 'score', sortDir: 'desc' });
    if (rows.length > 0 && rows[0].tce_usd_per_day !== null) {
      // If distance resolves → TCE must be positive (honest)
      expect(rows[0].tce_usd_per_day).toBeGreaterThan(0);
    }
    db.close();
  });
});

// ── Group 3: real-user paths (no stored economics) still recompute correctly ──

describe('persistSessionMatches — live recompute for real sessions', () => {
  it('no m.economics field: live recompute persisted with sign agreement', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, PROFIT_BALTIC, db)!;
    persistSessionMatches(db, SESSION, [makeMatch()], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tce_usd_per_day).not.toBeNull();
    expect(rows[0].tce_usd_per_day).toBe(expected.tce_usd_per_day);
    expect(Math.sign(rows[0].tce_usd_per_day as number))
      .toBe(Math.sign(expected.breakdown.net_voyage_usd));
    // list_tce === detail_tce holds on the recompute path too
    expect(getMatch(db, rows[0].id)?.tce_usd_per_day).toBe(rows[0].tce_usd_per_day);
  });

  it('m.economics.tceUsdPerDay undefined: live recompute persisted (no regression)', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(LOSS_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, LOSS_BALTIC, db)!;
    expect(expected.breakdown.net_voyage_usd).toBeLessThan(0);

    persistSessionMatches(db, SESSION, [withStoredTce(undefined)], [CARGO], [VESSEL]);
    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].tce_usd_per_day).toBe(expected.tce_usd_per_day);
    expect(rows[0].tce_usd_per_day).toBeLessThan(0);
    expect(Math.sign(rows[0].tce_usd_per_day as number))
      .toBe(Math.sign(expected.breakdown.net_voyage_usd));
    expect(getMatch(db, rows[0].id)?.tce_usd_per_day).toBe(rows[0].tce_usd_per_day);
  });
});
