/**
 * test-skill ATTACK-3 (cross-path-consistency, audit B.2 hardening).
 * Branch: claude/compassionate-jennings-cb6e62 · HEAD: dded0315
 *
 * The campaign's own guard (lib/matching/__tests__/write-path-field-parity.test.ts)
 * asserts NULL-parity for the column set and exact equality for only 3 headline
 * values. The stated goal is stronger: "a match renders identically regardless
 * of which path … last touched it." This test pins VALUE equality for every
 * deterministic column across the two write paths (parse-time precompute vs
 * /matches render persist). Mocks mirror the campaign's parity test exactly.
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
import { computeAndPersistMatches } from '@/lib/matching/compute-matches';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { analyzePairs, type AiScorer } from '@/lib/matching/pair-analyzer';
import { listMatches } from '@/lib/matching/matches-repository';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn().mockResolvedValue({ matches: [] }),
}));
jest.mock('@/lib/market/bunker-repository', () => ({
  getLatestBunkerPrice: jest.fn().mockReturnValue(null),
}));
jest.mock('@/lib/clock', () => ({
  ...jest.requireActual('@/lib/clock'),
  now: () => new Date('2026-09-01T00:00:00Z'),
}));

function makeDb(): Database.Database {
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

function makeCargo(emailId = 'parity-cargo'): ParsedCargo {
  return {
    emailId,
    itemIndex: 0,
    originPort: { value: 'Shanghai', confidence: 'confirmed' },
    originCountry: 'China',
    destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
    destinationCountry: 'Netherlands',
    cargoDescription: { value: 'Grain', confidence: 'confirmed' },
    weightMt: { value: 50000, confidence: 'confirmed' },
    weightMtMin: 50000,
    weightMtMax: 50000,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: 50000,
    incoterms: null,
    preferredDates: null,
    laycan: '2026-10-01 .. 2026-10-20',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    freightRateUsd: null,
  };
}

function makeVessel(emailId = 'parity-vessel'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV PARITY', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: 2015,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 55000, confidence: 'confirmed' },
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
    geared: false,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    openPosition: { value: 'Singapore', confidence: 'confirmed' },
    openDate: { value: '2026-09-15', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '14.0',
    speedBallast: '14.5',
    consumption: '30 mt IFO',
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  };
}

/** Deterministic columns — everything except identity/timestamps. */
const VALUE_COLUMNS = [
  'score', 'reason', 'reason_structured', 'cargo_type', 'load_port',
  'discharge_port', 'laycan_start', 'laycan_end', 'vessel_dwt',
  'tce_usd_per_day', 'distance_nm', 'freight_rate_usd_per_mt',
  'freight_rate_source', 'vessel_name', 'cargo_ref', 'fit_percent',
  'fit_breakdown', 'worksheet_json', 'breakeven_tce_usd_per_day',
  'ballast_distance_nm', 'consumption_estimated',
  'cargo_item_index', 'vessel_item_index', 'status',
] as const;

it('precompute and session-persist write IDENTICAL VALUES for every deterministic column', async () => {
  const cargos = [makeCargo()];
  const vessels = [makeVessel()];
  const db1 = makeDb();
  const db2 = makeDb();
  const stubScorer: AiScorer = async () => [];

  await computeAndPersistMatches(cargos, vessels, 'sess-1', db1);
  const res = await analyzePairs(cargos, vessels, stubScorer, { db: db2 });
  persistSessionMatches(db2, 'sess-1', res.matches, cargos, vessels);

  const a = listMatches(db1, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
  const b = listMatches(db2, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
  expect(a.length).toBeGreaterThan(0);
  expect(a.length).toBe(b.length);

  const key = (r: { cargo_id: string; vessel_id: string }) => `${r.cargo_id}|${r.vessel_id}`;
  const bByKey = new Map(b.map((r) => [key(r), r]));
  for (const rowA of a) {
    const rowB = bByKey.get(key(rowA));
    expect(rowB).toBeDefined();
    for (const col of VALUE_COLUMNS) {
      const va = (rowA as unknown as Record<string, unknown>)[col] ?? null;
      const vb = (rowB as unknown as Record<string, unknown>)[col] ?? null;
      // Label the column in the assertion so a failure names the diverging field.
      expect({ col, value: va }).toEqual({ col, value: vb });
    }
  }
});
