/**
 * test-skill adversarial review — wave-a-phantom-features (HEAD 534e72a5)
 * Classes: cross-path-consistency + conditional-ui-liveness + normalizer/validator
 * (audit A.1 charterer tier, audit A.2 honest PSC no-data).
 *
 * Attacks beyond the implementer's tests:
 *  1. checked-clean: rows exist but zero detentions → "0 detentions" STILL shown
 *     (the honest-no-data change must not also hide real clean records).
 *  2. lookback edge: rows exist only OUTSIDE the window → "0 detentions" (windowed
 *     count semantics, documented).
 *  3. fit drift direction: no-data vessel scores ≤ checked-clean vessel (removing
 *     the fake 'ok' factor must not INCREASE fit).
 *  4. charterer penalty end-to-end through analyzePairs: seeded weak tier +
 *     cargo.chartererName → fitBreakdown.chartererPenalty = 4 and fit exactly
 *     4 points below the same pair without a charterer (feed for
 *     UtilisationChartererDisclosure's `fb.chartererPenalty > 0` line).
 *  5. resolver ambiguity: two rows with identical NORMALIZED names but different
 *     tiers → which wins (listCharterers ORDER BY name ASC → first alphabetical).
 *     Documents nondeterministic-looking tie semantics.
 *  6. normalizeName edge: non-latin (Cyrillic) name normalizes to '' → null
 *     (silent neutral for non-ASCII charterer names — documented).
 *  7. seeder sharp edge: pre-existing row with SAME name, DIFFERENT id (e.g.
 *     created via /charterers UI) → upsertCharterer throws UNIQUE(name);
 *     seedCharterersWithDb crashes; --dry-run would not have caught it.
 */

import Database from 'better-sqlite3';
import migration026 from '@/lib/migrations/026-charterers';
import migration028 from '@/lib/migrations/028-psc-history';
import { upsertInspection } from '@/lib/market/psc-repository';
import { upsertCharterer } from '@/lib/market/charterers-repository';
import { resolveChartererTier } from '@/lib/matching/charterer-tier';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import { seedCharterersWithDb, CHARTERER_FIXTURE } from '@/scripts/demo-seed/seed-charterers';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

const TODAY = new Date('2026-05-28T00:00:00Z');
const IMO = '9540015';

function makeCargo(over: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'qa-cargo',
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
    ...over,
  } as ParsedCargo;
}

function makeVessel(over: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'qa-vessel',
    itemIndex: 0,
    vesselName: { value: 'MV QA PROBE', confidence: 'confirmed' },
    imo: null,
    flag: 'Marshall Islands',
    built: 2015,
    classSociety: 'DNV',
    pandi: 'Gard',
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
    ...over,
  } as ParsedVessel;
}

async function matchFor(
  db: Database.Database,
  cargoOver: Partial<ParsedCargo>,
  vesselOver: Partial<ParsedVessel>,
  suffix: string,
) {
  const cargo = makeCargo({ ...cargoOver, emailId: `qa-cargo-${suffix}` });
  const vessel = makeVessel({ ...vesselOver, emailId: `qa-vessel-${suffix}` });
  const r = await analyzePairs([cargo], [vessel], async () => [], {
    refYear: 2026,
    today: TODAY,
    db,
  });
  const m = r.matches[0] ?? r.lowConfidenceMatches[0];
  expect(m).toBeDefined();
  expect(m!.fitBreakdown).toBeDefined();
  return m!;
}

describe('A.2 PSC semantics — beyond the implementer tests', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    migration028.up(db);
  });
  afterEach(() => db.close());

  it('checked-clean: inspection rows with zero detentions → "0 detentions" still shown', async () => {
    upsertInspection(db, {
      id: 'qa-clean-1',
      imo: IMO,
      inspection_date: '2025-06-01',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 1,
      detained: false,
      source_url: null,
    });
    const m = await matchFor(db, {}, { imo: IMO }, 'clean');
    const vetting = m.fitBreakdown!.components.find((c) => c.factor === 'vetting')!;
    expect(vetting.bracketData).toBe('0 detentions');
  });

  it('window edge: detained row OUTSIDE the 3y lookback → counted as "0 detentions" (windowed)', async () => {
    upsertInspection(db, {
      id: 'qa-old-1',
      imo: IMO,
      inspection_date: '2019-02-01',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 9,
      detained: true,
      source_url: null,
    });
    const m = await matchFor(db, {}, { imo: IMO }, 'old');
    const vetting = m.fitBreakdown!.components.find((c) => c.factor === 'vetting')!;
    // has data → windowed count surfaces (0 within window even though detained in 2019)
    expect(vetting.bracketData).toBe('0 detentions');
  });

  it('fit drift direction: no-data vessel fit ≤ checked-clean vessel fit (same pair otherwise)', async () => {
    const mNoData = await matchFor(db, {}, { imo: IMO }, 'nodata');
    upsertInspection(db, {
      id: 'qa-clean-2',
      imo: IMO,
      inspection_date: '2025-06-01',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 0,
      detained: false,
      source_url: null,
    });
    const mClean = await matchFor(db, {}, { imo: IMO }, 'clean2');
    expect(mNoData.fitBreakdown!.fitPercent).toBeLessThanOrEqual(mClean.fitBreakdown!.fitPercent);
  });
});

describe('A.1 charterer tier — end-to-end feed for the UI penalty line', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    migration028.up(db);
    seedCharterersWithDb(db); // the branch's own fixture: Huaya = weak
  });
  afterEach(() => db.close());

  it('cargo.chartererName="Huaya" → chartererPenalty=4 in fitBreakdown; fit 4 points below no-name pair', async () => {
    const mNamed = await matchFor(db, { chartererName: 'Huaya' }, {}, 'named');
    const mAnon = await matchFor(db, { chartererName: null }, {}, 'anon');
    expect(mNamed.fitBreakdown!.chartererPenalty).toBe(4);
    expect(mAnon.fitBreakdown!.chartererPenalty).toBe(0);
    expect(mAnon.fitBreakdown!.fitPercent - mNamed.fitBreakdown!.fitPercent).toBeCloseTo(4, 5);
  });

  it('parser-style longer name "Huaya Maritime" does NOT match seeded "Huaya" (exact normalized equality)', () => {
    expect(resolveChartererTier(db, makeCargo({ chartererName: 'Huaya Maritime' }))).toBeNull();
  });

  it('blue-chip name resolves with zero penalty', async () => {
    const m = await matchFor(db, { chartererName: 'grain trader a' }, {}, 'bluechip');
    expect(m.fitBreakdown!.chartererPenalty).toBe(0);
  });
});

describe('A.1 resolver edges', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
  });
  afterEach(() => db.close());

  it('ambiguity: two rows normalize identically → alphabetically-first name wins (ORDER BY name ASC)', () => {
    upsertCharterer(db, { id: 'a1', name: 'HUAYA.', tier: 'blue-chip', payment_history: '[]', require_lc: 0, notes: null });
    upsertCharterer(db, { id: 'a2', name: 'huaya', tier: 'weak', payment_history: '[]', require_lc: 0, notes: null });
    // 'HUAYA.' < 'huaya' in BINARY collation → blue-chip row is hit first.
    expect(resolveChartererTier(db, makeCargo({ chartererName: 'Huaya' }))).toBe('blue-chip');
  });

  it('non-latin charterer name (Cyrillic) normalizes to empty → null (silent neutral)', () => {
    upsertCharterer(db, { id: 'cy', name: 'Хуая', tier: 'weak', payment_history: '[]', require_lc: 0, notes: null });
    expect(resolveChartererTier(db, makeCargo({ chartererName: 'Хуая' }))).toBeNull();
  });

  it('whitespace/punct-insensitive match works (sanity from plan)', () => {
    upsertCharterer(db, { id: 'h', name: 'Huaya Maritime', tier: 'weak', payment_history: '[]', require_lc: 0, notes: null });
    expect(resolveChartererTier(db, makeCargo({ chartererName: '  huaya  MARITIME. ' }))).toBe('weak');
  });
});

describe('A.1 seeder sharp edge — same name, different id (UI-created row)', () => {
  // FLIPPED 2026-06-12 (QA F-001 fix): the seeder now ADOPTS a same-name row
  // in place (keeps its id, aligns rating fields) instead of crashing on
  // UNIQUE(name), and runs in a transaction.
  it('seedCharterersWithDb adopts "Huaya" existing under another id (no UNIQUE crash)', () => {
    const db = new Database(':memory:');
    migration026.up(db);
    // Simulates a charterer added through the /charterers UI before the seed run.
    db.prepare(
      `INSERT INTO charterers (id, name, tier, payment_history, require_lc, notes)
       VALUES ('ui-12345', 'Huaya', 'second', '[]', 0, 'added by founder via UI')`,
    ).run();
    const res = seedCharterersWithDb(db);
    expect(res.adopted).toBe(1);
    const huaya = db
      .prepare(`SELECT id, tier, notes FROM charterers WHERE name = 'Huaya'`)
      .all() as Array<{ id: string; tier: string; notes: string }>;
    expect(huaya).toHaveLength(1);
    expect(huaya[0].id).toBe('ui-12345'); // original id preserved
    expect(huaya[0].tier).toBe('weak'); // rating aligned with fixture
    // Second run converges: the adopted row now carries the demo marker,
    // gets cleared and re-adopted/inserted without duplication.
    const res2 = seedCharterersWithDb(db);
    expect(res2.deleted).toBe(3);
    expect(db.prepare(`SELECT COUNT(*) c FROM charterers`).get()).toEqual({ c: 3 });
    db.close();
  });

  it('fixture itself is internally consistent (ids unique, names unique post-normalization)', () => {
    const ids = new Set(CHARTERER_FIXTURE.map((r) => r.id));
    expect(ids.size).toBe(CHARTERER_FIXTURE.length);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const names = new Set(CHARTERER_FIXTURE.map((r) => norm(r.name)));
    expect(names.size).toBe(CHARTERER_FIXTURE.length);
  });
});
