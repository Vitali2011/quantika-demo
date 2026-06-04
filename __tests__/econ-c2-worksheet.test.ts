/**
 * Adversarial QA — econ C2-live: stale worksheet rebuild.
 *
 * Tests two edits from plan §4 C2-live:
 *   (1) regenerate-matches.ts --rebuild-worksheet mode (rebuildWorksheets export)
 *   (2) persist-session-matches.ts fail-closed laycan disagreement
 *
 * Synthetic in-memory SQLite DB with REAL value shapes (plan §5.1):
 *   - parsed_results cargo: normalized June 2 laycan string
 *   - seed match worksheet_json: stale July 4 readiness (pre-normalization era)
 *
 * PI2 behavioral: calls rebuildWorksheets() and persistSessionMatches() directly.
 * PI3: does NOT rewrite existing test expectations.
 */

import Database from 'better-sqlite3';
import migration031 from '@/lib/migrations/031-email-cache';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration039 from '@/lib/migrations/039-demo-seed-meta';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import migration045 from '@/lib/migrations/045-matches-worksheet';
import { rebuildWorksheets } from '@/scripts/demo-seed/regenerate-matches';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { getMatch } from '@/lib/matching/matches-repository';
import type { Match, ParsedCargo, ParsedVessel, MatchWorksheet } from '@/lib/types';

// Suppress Baltic-rate DB lookups — controlled externally
jest.mock('@/lib/market/baltic-freight', () => ({
  getBalticDayRate: jest.fn(() => ({ usdPerDay: 25000, date: '2026-06-01', indexCode: 'BHSI_TC' })),
}));

// ── DB helpers ────────────────────────────────────────────────────────────────

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  // parsed_results + emails
  migration031.up(db);
  // matches schema (all required columns)
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  migration044.up(db);
  migration045.up(db);
  // demo_seed_meta
  migration039.up(db);
  return db;
}

/** Insert demo_seed_meta so rebuildWorksheets uses a known frozen date */
function insertMeta(db: Database.Database, frozenDate = '2026-06-01') {
  db.prepare(
    `INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, ?, 'test')`,
  ).run(frozenDate);
}

const CARGO_EMAIL_ID = 'cargo-c2-test-01';
const VESSEL_EMAIL_ID = 'vessel-c2-test-01';
const SESSION = 'test-session-c2';

/**
 * Cargo parsed_result — normalized June 2 laycan (the "fresh" state after
 * normalization corrected the July object to the actual June 2 string).
 */
const CARGO_PARSED = {
  emailId: CARGO_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Aliaga', confidence: 'confirmed', sourceText: 'aliaga' },
  destinationPort: { value: 'Constanta', confidence: 'confirmed', sourceText: 'constanta' },
  laycan: '2026-06-02 to 2026-06-07',
  weightMt: { value: 61000, confidence: 'confirmed', sourceText: '61000 mt' },
  cargoType: 'GRAIN',
  missingInfo: [],
};

/**
 * Vessel parsed_result — normalized ConfidenceField openDate (post-wrapOpenDate).
 * Opens June 9 at Constanta: arrives at Aliaga AFTER laycan-start June 2 → LATE.
 */
const VESSEL_PARSED = {
  emailId: VESSEL_EMAIL_ID,
  itemIndex: 0,
  openDate: { value: '2026-06-09', confidence: 'confirmed', sourceText: '9 June Constanta' },
  openPosition: { value: 'Constanta', confidence: 'confirmed', sourceText: 'constanta' },
  speedLaden: '13 kn',
  dwtSummer: { value: 61000, confidence: 'confirmed', sourceText: '61000 dwt' },
  vesselName: { value: 'SEAGULL 12', confidence: 'confirmed', sourceText: 'seagull 12' },
  consumption: '32 mt/day',
  restrictions: [],
  specialFeatures: [],
};

/** Stale worksheet with July 4 laycan — the pre-normalization era readiness */
const STALE_WORKSHEET: MatchWorksheet = {
  readiness: {
    openDate: '2026-06-03',
    laycanStart: '2026-07-04',
    laycanEnd: '2026-07-09',
    distanceNm: 520,
    distanceExact: false,
    speedKn: 13,
    sailingDays: 1.67,
    arrivalDate: '2026-06-05',
    gapDays: 24.41,
    verdict: 'idle',
    explanation: 'Vessel open 2026-06-03 → arrives 2026-06-05 → 24d before laycan 2026-07-04.',
    openPosition: 'Hodeidah',
  },
  vessel: {
    draftMax: 12.8,
    grainCapacity: 78000,
    grainCapacityUnit: 'cbm',
    geared: false,
    vesselType: 'BULK',
    flag: 'MH',
    built: 2012,
    pandi: 'GARD',
    classSociety: 'ABS',
    lastCargoes: 'GRAIN, FERTILIZERS',
    dwtSummer: 61000,
    dwcc: 59500,
  },
  cargo: {
    weightMt: 61000,
    cargoType: 'GRAIN',
    loadPort: 'Marmara',
    dischargePort: 'Veracruz',
  },
  hardFilters: {
    draft: { pass: true },
    crane: { pass: true },
    volume: { pass: true },
  },
};

/**
 * Insert a seed match (user_id IS NULL) with the stale July worksheet.
 * Returns the row id for later verification.
 */
function insertSeedMatch(
  db: Database.Database,
  opts: {
    cargoId?: string;
    vesselId?: string;
    laycanStart?: number;
    distanceNm?: number;
    fitPercent?: number;
    worksheet?: MatchWorksheet;
  } = {},
): number {
  const {
    cargoId = CARGO_EMAIL_ID,
    vesselId = VESSEL_EMAIL_ID,
    laycanStart = new Date('2026-07-04').getTime(),
    distanceNm = 1827,
    fitPercent = 72,
    worksheet = STALE_WORKSHEET,
  } = opts;

  const result = db.prepare(`
    INSERT INTO matches
      (cargo_id, vessel_id, cargo_item_index, vessel_item_index,
       score, reason, status, user_id, created_at, updated_at,
       laycan_start, distance_nm, fit_percent, worksheet_json)
    VALUES (?, ?, 0, 0, 78, 'test reason', 'shortlist', NULL,
            1749000000000, 1749000000000,
            ?, ?, ?, ?)
  `).run(cargoId, vesselId, laycanStart, distanceNm, fitPercent, JSON.stringify(worksheet));

  return Number(result.lastInsertRowid);
}

function insertParsedResults(db: Database.Database) {
  const insert = db.prepare(
    `INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json)
     VALUES ('', ?, ?, '1', ?)`,
  );
  insert.run(CARGO_EMAIL_ID, 'cargo', JSON.stringify([CARGO_PARSED]));
  insert.run(VESSEL_EMAIL_ID, 'vessel', JSON.stringify([VESSEL_PARSED]));
}

// ── Suite 1: rebuildWorksheets — stale July → fresh June ─────────────────────

describe('rebuildWorksheets — stale worksheet rewrite (C2-live §1)', () => {
  it('rewrites worksheet_json.readiness.laycanStart from July to June', async () => {
    const db = freshDb();
    insertMeta(db);
    insertParsedResults(db);
    const matchId = insertSeedMatch(db);

    const summary = await rebuildWorksheets(db, { dry: false });

    expect(summary.planned).toBe(1);
    expect(summary.written).toBe(1);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].matchId).toBe(matchId);
    expect(summary.rows[0].oldLaycanStart).toBe('2026-07-04');
    expect(summary.rows[0].newLaycanStart).toBe('2026-06-02');

    // Verify DB was updated
    const row = db.prepare('SELECT worksheet_json FROM matches WHERE id = ?').get(matchId) as
      | { worksheet_json: string }
      | undefined;
    expect(row).toBeDefined();
    const ws = JSON.parse(row!.worksheet_json) as MatchWorksheet;
    expect(ws.readiness.laycanStart).toBe('2026-06-02');
    expect(ws.readiness.gapDays).not.toBeNull();
    expect(ws.readiness.gapDays!).toBeLessThan(-1); // LATE
    expect(ws.readiness.verdict).toBe('late');
  });

  it('idempotent: second run on already-rebuilt DB → 0 planned rewrites', async () => {
    const db = freshDb();
    insertMeta(db);
    insertParsedResults(db);
    insertSeedMatch(db);

    // First run rebuilds
    const run1 = await rebuildWorksheets(db, { dry: false });
    expect(run1.planned).toBe(1);

    // Second run: worksheet now agrees with parsed_results → nothing to rewrite
    const run2 = await rebuildWorksheets(db, { dry: false });
    expect(run2.planned).toBe(0);
    expect(run2.written).toBe(0);
  });

  it('parity guard: laycan_start, distance_nm, fit_percent unchanged after rebuild', async () => {
    const db = freshDb();
    insertMeta(db);
    insertParsedResults(db);
    const matchId = insertSeedMatch(db, {
      laycanStart: new Date('2026-07-04').getTime(),
      distanceNm: 1827,
      fitPercent: 72,
    });

    const before = db.prepare(
      'SELECT laycan_start, distance_nm, fit_percent FROM matches WHERE id = ?',
    ).get(matchId) as { laycan_start: number; distance_nm: number; fit_percent: number };

    await rebuildWorksheets(db, { dry: false });

    const after = db.prepare(
      'SELECT laycan_start, distance_nm, fit_percent FROM matches WHERE id = ?',
    ).get(matchId) as { laycan_start: number; distance_nm: number; fit_percent: number };

    // These columns must be UNCHANGED — only worksheet_json is updated
    expect(after.laycan_start).toBe(before.laycan_start);
    expect(after.distance_nm).toBe(before.distance_nm);
    expect(after.fit_percent).toBe(before.fit_percent);
  });

  it('dry mode: reports planned rewrites without writing to DB', async () => {
    const db = freshDb();
    insertMeta(db);
    insertParsedResults(db);
    const matchId = insertSeedMatch(db);

    const summary = await rebuildWorksheets(db, { dry: true });

    expect(summary.planned).toBe(1);
    expect(summary.written).toBe(0); // dry → no writes

    // DB must be unchanged
    const row = db.prepare('SELECT worksheet_json FROM matches WHERE id = ?').get(matchId) as
      | { worksheet_json: string }
      | undefined;
    const ws = JSON.parse(row!.worksheet_json) as MatchWorksheet;
    expect(ws.readiness.laycanStart).toBe('2026-07-04'); // still stale
  });

  it('no-op for match whose worksheet already agrees with parsed_results', async () => {
    const db = freshDb();
    insertMeta(db);
    insertParsedResults(db);
    // Worksheet with CORRECT June 2 laycan already
    const freshWorksheet: MatchWorksheet = {
      ...STALE_WORKSHEET,
      readiness: { ...STALE_WORKSHEET.readiness, laycanStart: '2026-06-02', verdict: 'late' },
    };
    insertSeedMatch(db, { worksheet: freshWorksheet });

    const summary = await rebuildWorksheets(db, { dry: false });
    expect(summary.planned).toBe(0);
    expect(summary.written).toBe(0);
  });
});

// ── Suite 2: persistSessionMatches fail-closed (C2-live §2) ──────────────────

/** Minimal ParsedCargo with June 2 laycan (the fresh normalized state) */
const CARGO_JUNE: ParsedCargo = {
  emailId: CARGO_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Aliaga', confidence: 'confirmed', sourceText: 'aliaga' } as any,
  destinationPort: { value: 'Constanta', confidence: 'confirmed', sourceText: 'constanta' } as any,
  laycan: '2026-06-02 to 2026-06-07',
  weightMt: { value: 61000, confidence: 'confirmed', sourceText: '61000 mt' } as any,
  cargoType: 'GRAIN',
  freightRateUsd: null,
  missingInfo: [],
} as unknown as ParsedCargo;

/** ParsedVessel opening June 9 at Constanta — arrives at Aliaga AFTER June 2 → LATE */
const VESSEL_JUNE9: ParsedVessel = {
  emailId: VESSEL_EMAIL_ID,
  itemIndex: 0,
  openDate: { value: '2026-06-09', confidence: 'confirmed', sourceText: '9 June Constanta' } as any,
  openPosition: { value: 'Constanta', confidence: 'confirmed', sourceText: 'constanta' } as any,
  speedLaden: '13 kn',
  dwtSummer: { value: 61000, confidence: 'confirmed', sourceText: '61000 dwt' } as any,
  vesselName: { value: 'SEAGULL 12', confidence: 'confirmed', sourceText: 'seagull 12' } as any,
  consumption: '32 mt/day',
  restrictions: [],
  specialFeatures: [],
} as unknown as ParsedVessel;

function makeMatchWithStaleWorksheet(overrides?: Partial<Match>): Match {
  return {
    cargoEmailId: CARGO_EMAIL_ID,
    cargoItemIndex: 0,
    vesselEmailId: VESSEL_EMAIL_ID,
    vesselItemIndex: 0,
    score: 78,
    matchLevel: 'good',
    matchReasons: ['test'],
    issues: [],
    worksheet: STALE_WORKSHEET,
    ...overrides,
  };
}

describe('persistSessionMatches — fail-closed laycan disagreement (C2-live §2)', () => {
  it('recomputes worksheet when stored laycanStart disagrees with cargo laycan', () => {
    const db = freshDb();
    // Match has July 4 worksheet; cargo has June 2 laycan → mismatch → rebuild
    const m = makeMatchWithStaleWorksheet();
    persistSessionMatches(db, SESSION, [m], [CARGO_JUNE], [VESSEL_JUNE9]);

    const row = db.prepare(
      `SELECT worksheet_json FROM matches WHERE user_id = ? LIMIT 1`,
    ).get(SESSION) as { worksheet_json: string } | undefined;

    expect(row).toBeDefined();
    const ws = JSON.parse(row!.worksheet_json) as MatchWorksheet;

    // Key assertion: laycanStart rebuilt to June 2
    expect(ws.readiness.laycanStart).toBe('2026-06-02');
    // Vessel arrives after laycan start → gap negative → LATE
    expect(ws.readiness.gapDays).not.toBeNull();
    expect(ws.readiness.gapDays!).toBeLessThan(-1);
    expect(ws.readiness.verdict).toBe('late');
  });

  it('does NOT recompute worksheet when laycanStart already agrees', () => {
    const db = freshDb();
    // Worksheet already has June 2 laycan — no rebuild expected
    const freshWorksheet: MatchWorksheet = {
      ...STALE_WORKSHEET,
      readiness: {
        ...STALE_WORKSHEET.readiness,
        laycanStart: '2026-06-02',
        verdict: 'tight',
        gapDays: -0.5,
      },
    };
    const m = makeMatchWithStaleWorksheet({ worksheet: freshWorksheet });
    persistSessionMatches(db, SESSION, [m], [CARGO_JUNE], [VESSEL_JUNE9]);

    const row = db.prepare(
      `SELECT worksheet_json FROM matches WHERE user_id = ? LIMIT 1`,
    ).get(SESSION) as { worksheet_json: string } | undefined;

    expect(row).toBeDefined();
    const ws = JSON.parse(row!.worksheet_json) as MatchWorksheet;
    // Should remain unchanged (tight, not rebuilt to late)
    expect(ws.readiness.laycanStart).toBe('2026-06-02');
    expect(ws.readiness.verdict).toBe('tight');
    expect(ws.readiness.gapDays).toBe(-0.5);
  });

  it('pass-through when worksheet is absent (no regression)', () => {
    const db = freshDb();
    const m = makeMatchWithStaleWorksheet({ worksheet: undefined });
    persistSessionMatches(db, SESSION, [m], [CARGO_JUNE], [VESSEL_JUNE9]);

    const row = db.prepare(
      `SELECT worksheet_json FROM matches WHERE user_id = ? LIMIT 1`,
    ).get(SESSION) as { worksheet_json: string | null } | undefined;

    expect(row).toBeDefined();
    expect(row!.worksheet_json).toBeNull();
  });

  it('pass-through when cargo is missing from parsedCargos (no regression)', () => {
    const db = freshDb();
    const m = makeMatchWithStaleWorksheet();
    // Pass empty parsedCargos — cargo can't be found → worksheet passed through verbatim
    persistSessionMatches(db, SESSION, [m], [], [VESSEL_JUNE9]);

    const row = db.prepare(
      `SELECT worksheet_json FROM matches WHERE user_id = ? LIMIT 1`,
    ).get(SESSION) as { worksheet_json: string | null } | undefined;

    expect(row).toBeDefined();
    const ws = JSON.parse(row!.worksheet_json!) as MatchWorksheet;
    // Verbatim pass-through: still July 4 (no rebuild possible without cargo)
    expect(ws.readiness.laycanStart).toBe('2026-07-04');
  });
});
