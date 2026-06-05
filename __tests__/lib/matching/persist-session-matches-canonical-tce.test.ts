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
 * Returns the SAME TceEstimate the SUT will derive — so tests can assert on
 * `persisted === expected` (override removal proof) and on
 * `sign(persisted) === sign(net_voyage)` (sign-agreement contract) without
 * hard-coding values that would drift if port-distances or fixtures change.
 */
function expectedLive(
  cargo: ParsedCargo,
  vessel: ParsedVessel,
  baltic: { usdPerDay: number; date: string; indexCode: string },
): ReturnType<typeof computeEstimatedTce> | null {
  const loadPort = cfValue(cargo.originPort);
  const dischargePort = cfValue(cargo.destinationPort);
  const dist = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
  if (!dist || dist.nm <= 0) return null;

  const vesselDwt = (cfValue(vessel.dwtSummer) ?? 0) as number;
  const quantityMt = resolveCargoWeight(cargo) ?? 0;
  const speedKts = parseLeadingNumber(vessel.speedLaden);
  const consumptionMt = parseConsumption(vessel.consumption);
  const cargoTypeStr =
    typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
      ? (cargo.cargoType as unknown as { value: string }).value
      : (cargo.cargoType as string | null);

  const resolved = resolveFreightRate({
    cargoType: cargoTypeStr,
    parsedFreightRateUsdPerMt: cargo.freightRateUsd ?? null,
    vesselDwt,
    quantityMt,
    distanceNm: dist.nm,
    speedKts,
    balticDayRate: baltic,
  });
  return computeEstimatedTce(
    { rate: resolved.value, source: resolved.source, confidence: resolved.confidence },
    dist.nm, vesselDwt, quantityMt, speedKts, consumptionMt,
  );
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

    const expected = expectedLive(CARGO, VESSEL, PROFIT_BALTIC);
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

    const expected = expectedLive(CARGO, VESSEL, LOSS_BALTIC);
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

// ── Group 2: list_tce === detail_tce for the same DB row ──────────────────────

describe('persistSessionMatches — list tce equals detail tce', () => {
  it('GET list and GET detail return the same tce_usd_per_day for a single match', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, PROFIT_BALTIC)!;
    persistSessionMatches(db, SESSION, [withStoredTce(7777)], [CARGO], [VESSEL]);

    const listRows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(listRows).toHaveLength(1);
    const listTce = listRows[0].tce_usd_per_day;
    const detailTce = getMatch(db, listRows[0].id)?.tce_usd_per_day;

    expect(listTce).not.toBeNull();
    expect(listTce).toBe(detailTce);                                    // contract A: same row, same value
    expect(listTce).toBe(expected.tce_usd_per_day);                     // both reflect the live recompute
    expect(Math.sign(listTce as number))
      .toBe(Math.sign(expected.breakdown.net_voyage_usd));              // contract B: sign agreement
  });

  it('N=3 matches with distinct stored sentinels: list_tce === detail_tce for each, all equal the live recompute', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, PROFIT_BALTIC)!;
    const liveTce = expected.tce_usd_per_day;

    // Three matches against the same pair but with distinct stored-sentinel values
    // that the old override would have surfaced — convergence to liveTce proves
    // the override is gone and the list/detail paths agree.
    const sentinels = [123, -456, 789_012];
    const matches = sentinels.map((tce, i) =>
      withStoredTce(tce, {
        cargoEmailId: `cargo-${i}`,
        vesselEmailId: `vessel-${i}`,
        score: 80 - i * 5,
      }),
    );
    const cargos = sentinels.map((_, i) => ({ ...CARGO, emailId: `cargo-${i}` } as ParsedCargo));
    const vessels = sentinels.map((_, i) => ({ ...VESSEL, emailId: `vessel-${i}` } as ParsedVessel));

    persistSessionMatches(db, SESSION, matches, cargos, vessels);

    const listRows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(listRows).toHaveLength(3);

    for (const row of listRows) {
      const detail = getMatch(db, row.id);
      expect(detail?.tce_usd_per_day).toBe(row.tce_usd_per_day);        // contract A: same row, same value
      expect(row.tce_usd_per_day).toBe(liveTce);                        // override removed → all converge to live
      expect(row.tce_usd_per_day).not.toBe(123);
      expect(row.tce_usd_per_day).not.toBe(-456);
      expect(row.tce_usd_per_day).not.toBe(789_012);
      expect(Math.sign(row.tce_usd_per_day as number))
        .toBe(Math.sign(expected.breakdown.net_voyage_usd));            // contract B: sign agreement
    }
  });
});

// ── Group 3: real-user paths (no stored economics) still recompute correctly ──

describe('persistSessionMatches — live recompute for real sessions', () => {
  it('no m.economics field: live recompute persisted with sign agreement', () => {
    const db = freshDb();
    mockBaltic.mockReturnValue(PROFIT_BALTIC);

    const expected = expectedLive(CARGO, VESSEL, PROFIT_BALTIC)!;
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

    const expected = expectedLive(CARGO, VESSEL, LOSS_BALTIC)!;
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
