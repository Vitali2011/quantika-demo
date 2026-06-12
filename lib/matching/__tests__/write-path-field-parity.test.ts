/**
 * Write-path parity guard (audit B.2 / "0/77" bug class, memory
 * feedback_two_write_paths_in_scope): the parse-time precompute
 * (computeAndPersistMatches) and the /matches render persist
 * (persistSessionMatches) must populate the SAME columns for the same match.
 * If a future field is added to one path only, this test fails.
 *
 * Both paths run the REAL analyzePairs engine with the LLM boundary stubbed
 * to return no matches — the deterministic sweep path scores every pair, so
 * the two paths see identical Match objects.
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

// Mock ONLY the LLM boundary — the aiScorer inside computeAndPersistMatches
// wraps callAiJson; returning { matches: [] } routes every pair through the
// deterministic sweep, identical to the stubScorer used for the direct
// analyzePairs call below (same mock shape as __tests__/api/compute-matches.test.ts).
jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn().mockResolvedValue({ matches: [] }),
}));

// Pin the bunker price to "absent" so every economics call — inside analyzePairs
// for both paths AND inside both persist functions — uses the same helper default.
jest.mock('@/lib/market/bunker-repository', () => ({
  getLatestBunkerPrice: jest.fn().mockReturnValue(null),
}));

// Freeze the engine clock: computeAndPersistMatches has no `today` option (it
// always calls now()), so pin now() to keep the fixture's Oct-2026 laycan in
// the future regardless of when this suite runs.
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

// ── Fixtures (cribbed from pair-analyzer-tce-into-fit.test.ts) ───────────────
// Cargo Shanghai → Rotterdam, grain 50 000 mt, laycan Oct 2026; vessel 55 000
// dwt open Singapore mid-Sep — short ballast, healthy TCE → main bucket.

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

const PARITY_COLUMNS = [
  'score', 'reason', 'reason_structured', 'cargo_type', 'load_port',
  'discharge_port', 'laycan_start', 'laycan_end', 'vessel_dwt',
  'tce_usd_per_day', 'distance_nm', 'freight_rate_usd_per_mt',
  'freight_rate_source', 'vessel_name', 'cargo_ref', 'fit_percent',
  'fit_breakdown', 'worksheet_json', 'breakeven_tce_usd_per_day',
  'ballast_distance_nm', 'consumption_estimated',
] as const;

it('precompute and session-persist write the same column set for the same match', async () => {
  const cargos = [makeCargo()];
  const vessels = [makeVessel()];
  const db1 = makeDb();
  const db2 = makeDb();
  const stubScorer: AiScorer = async () => []; // sweep path covers scoring deterministically

  // Path A — parse-time precompute (analyzePairs runs inside, LLM mocked to []).
  await computeAndPersistMatches(cargos, vessels, 'sess-1', db1);

  // Path B — /matches render persist over the same engine output.
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
    for (const col of PARITY_COLUMNS) {
      const aNull = (rowA as unknown as Record<string, unknown>)[col] == null;
      const bNull = (rowB as unknown as Record<string, unknown>)[col] == null;
      // Column populated by one path must be populated by the other.
      expect(`${col}:${aNull}`).toBe(`${col}:${bNull}`);
    }
    // Numeric agreement on the headline values (same engine, same db inputs).
    expect(rowA.fit_percent).toBe(rowB!.fit_percent);
    expect(rowA.tce_usd_per_day).toBe(rowB!.tce_usd_per_day);
    expect(rowA.breakeven_tce_usd_per_day).toBe(rowB!.breakeven_tce_usd_per_day);
  }
});
