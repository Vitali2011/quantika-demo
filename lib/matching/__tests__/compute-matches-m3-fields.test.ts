/**
 * Behavioral tests — computeAndPersistMatches M3 field write-through
 *
 * Covers (PI2 requirement):
 *   (a) Match created with all M3 parser fields populated (cargo_type, load_port,
 *       discharge_port, laycan_start, laycan_end, vessel_dwt, reason_structured)
 *   (b) Null-safe: partial cargo/vessel data → missing fields stored as null
 *   (c) reason_structured from scoreBreakdown is persisted as JSON
 *
 * analyzePairs is mocked so these tests are deterministic and LLM-free.
 * The function under test (computeAndPersistMatches) is called for real.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import { computeAndPersistMatches } from '@/lib/matching/compute-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: jest.fn(),
}));

import { analyzePairs } from '@/lib/matching/pair-analyzer';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  return db;
}

const CARGO_EMAIL_ID = 'email-cargo-1';
const VESSEL_EMAIL_ID = 'email-vessel-1';

function makeMatch(overrides: Partial<{
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  score: number;
  scoreBreakdown: object | null;
}> = {}) {
  return {
    cargoEmailId: overrides.cargoEmailId ?? CARGO_EMAIL_ID,
    cargoItemIndex: overrides.cargoItemIndex ?? 0,
    vesselEmailId: overrides.vesselEmailId ?? VESSEL_EMAIL_ID,
    vesselItemIndex: overrides.vesselItemIndex ?? 0,
    score: overrides.score ?? 80,
    matchLevel: 'good' as const,
    matchReasons: ['DWCC fits cargo weight'],
    issues: [],
    scoreBreakdown: overrides.scoreBreakdown !== undefined ? overrides.scoreBreakdown : null,
  };
}

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: CARGO_EMAIL_ID,
    itemIndex: 0,
    originPort: { value: 'Hamburg', confidence: 'confirmed' },
    destinationPort: { value: 'Singapore', confidence: 'confirmed' },
    cargoType: 'BREAK_BULK',
    laycan: '1-15 Jun 2025',
    cargoDescription: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    originCountry: null,
    destinationCountry: null,
    ...overrides,
  };
}

function makeVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: VESSEL_EMAIL_ID,
    itemIndex: 0,
    dwtSummer: { value: 12000, confidence: 'confirmed' },
    vesselName: null,
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwcc: null,
    draftMax: null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: null,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: null,
    craneCapacity: null,
    hatchType: null,
    vesselType: null,
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('computeAndPersistMatches — M3 field write-through', () => {
  it('(a) persists cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt', async () => {
    const db = freshDb();
    const cargo = makeCargo();
    const vessel = makeVessel();

    (analyzePairs as jest.Mock).mockResolvedValueOnce({
      matches: [makeMatch()],
      blockedMatches: [],
    });

    const count = await computeAndPersistMatches([cargo], [vessel], 'session-1', db);
    expect(count).toBe(1);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });

    expect(match.cargo_type).toBe('BREAK_BULK');
    expect(match.load_port).toBe('Hamburg');
    expect(match.discharge_port).toBe('Singapore');

    const expectedLaycan = parseLaycan('1-15 Jun 2025');
    expect(match.laycan_start).toBe(expectedLaycan!.start.getTime());
    expect(match.laycan_end).toBe(expectedLaycan!.end.getTime());

    expect(match.vessel_dwt).toBe(12000);
  });

  it('(b) null-safe: partial cargo — null ports, null laycan → fields stored as null', async () => {
    const db = freshDb();
    const cargo = makeCargo({
      originPort: null,
      destinationPort: null,
      laycan: null,
    });
    const vessel = makeVessel();

    (analyzePairs as jest.Mock).mockResolvedValueOnce({
      matches: [makeMatch()],
      blockedMatches: [],
    });

    await computeAndPersistMatches([cargo], [vessel], 'session-2', db);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });

    expect(match.load_port).toBeNull();
    expect(match.discharge_port).toBeNull();
    expect(match.laycan_start).toBeNull();
    expect(match.laycan_end).toBeNull();
    expect(match.vessel_dwt).toBe(12000);
  });

  it('(b) null-safe: partial vessel — null dwtSummer → vessel_dwt stored as null', async () => {
    const db = freshDb();
    const cargo = makeCargo();
    const vessel = makeVessel({ dwtSummer: null });

    (analyzePairs as jest.Mock).mockResolvedValueOnce({
      matches: [makeMatch()],
      blockedMatches: [],
    });

    await computeAndPersistMatches([cargo], [vessel], 'session-3', db);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });

    expect(match.vessel_dwt).toBeNull();
    expect(match.load_port).toBe('Hamburg');
  });

  it('(c) reason_structured persisted from scoreBreakdown as JSON string', async () => {
    const db = freshDb();
    const breakdown = {
      finalScore: 78,
      components: [{ label: 'Geographic proximity', points: 16, max: 20 }],
    };

    (analyzePairs as jest.Mock).mockResolvedValueOnce({
      matches: [makeMatch({ scoreBreakdown: breakdown })],
      blockedMatches: [],
    });

    await computeAndPersistMatches([makeCargo()], [makeVessel()], 'session-4', db);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });

    expect(match.reason_structured).not.toBeNull();
    const parsed = JSON.parse(match.reason_structured!);
    expect(parsed.finalScore).toBe(78);
    expect(parsed.components[0].label).toBe('Geographic proximity');
  });

  it('(b) null-safe: no scoreBreakdown → reason_structured is null', async () => {
    const db = freshDb();

    (analyzePairs as jest.Mock).mockResolvedValueOnce({
      matches: [makeMatch({ scoreBreakdown: null })],
      blockedMatches: [],
    });

    await computeAndPersistMatches([makeCargo()], [makeVessel()], 'session-5', db);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match.reason_structured).toBeNull();
  });

  it('returns 0 without persisting when session already has matches (idempotency)', async () => {
    const db = freshDb();

    (analyzePairs as jest.Mock).mockResolvedValue({
      matches: [makeMatch()],
      blockedMatches: [],
    });

    const first = await computeAndPersistMatches([makeCargo()], [makeVessel()], 'session-idem', db);
    expect(first).toBe(1);

    const second = await computeAndPersistMatches([makeCargo()], [makeVessel()], 'session-idem', db);
    expect(second).toBe(0);

    const all = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(all).toHaveLength(1);
  });
});
