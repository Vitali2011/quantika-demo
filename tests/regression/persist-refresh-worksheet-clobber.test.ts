/**
 * test-skill ATTACK-1 (cross-path-consistency, audit B.6 blast-radius).
 * Branch: claude/compassionate-jennings-cb6e62 · HEAD: dded0315
 *
 * Campaign goal under test (docs/superpowers/plans/2026-06-12-write-path-convergence.md):
 *   "a match renders identically regardless of which path … last touched it."
 *
 * Reachable production chain (all out-of-diff links verified by reading):
 *   1. Demo login → hydrate-demo-session.ts attaches m.worksheet to session
 *      matches (built from seed worksheet_json).
 *   2. First /matches render → persistSessionMatches inserts session rows WITH
 *      worksheet_json (drives /match/[id] comparison table, laycan_display,
 *      bucket-reason card).
 *   3. User visits /processing → pipeline auto-runs on mount
 *      (app/processing/page.tsx:178) → POST /api/ai/match replaces
 *      session.matches with ENGINE output (app/api/ai/match/route.ts) — and
 *      pair-analyzer.ts NEVER attaches m.worksheet (zero occurrences; the
 *      in-diff NOTE in compute-matches.ts admits this).
 *   4. Next /matches or /dashboard render → persistSessionMatches now passes
 *      refreshComputed: true (B.6) → refreshComputedColumns runs
 *      `SET worksheet_json = NULL` on every previously-hydrated session row.
 *
 * Before B.6, INSERT OR IGNORE preserved the hydrated first-insert row, so the
 * worksheet survived step 4. The refresh introduced the demotion path.
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
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

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

// Minimal parsed fixtures — no laycan, so persist's stale-laycan worksheet
// rebuild branch stays out of the way (laycan === null skips it).
const CARGO = {
  emailId: 'cargo-1',
  itemIndex: 0,
  originPort: { value: 'Odessa', confidence: 'confirmed' },
  destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
  weightMt: { value: 5000, confidence: 'confirmed' },
  cargoType: 'GRAIN',
  freightRateUsd: null,
  missingInfo: [],
} as unknown as ParsedCargo;

const VESSEL = {
  emailId: 'vessel-1',
  itemIndex: 0,
  dwtSummer: { value: 28000, confidence: 'confirmed' },
  speedLaden: '12 kn',
  consumption: '22 mt/day',
  restrictions: [],
  specialFeatures: [],
} as unknown as ParsedVessel;

const WORKSHEET = {
  readiness: {
    verdict: 'laycan_ok',
    gapDays: 2,
    laycanStart: null,
    laycanEnd: null,
    openDate: null,
    distanceNm: null,
    distanceExact: false,
    speedKn: null,
    sailingDays: null,
    arrivalDate: null,
    explanation: 'fits laycan',
    openPosition: null,
  },
  vessel: {
    draftMax: null, grainCapacity: null, grainCapacityUnit: null, geared: true,
    vesselType: 'Bulk Carrier', flag: null, built: 2015, pandi: null,
    classSociety: null, lastCargoes: null, dwtSummer: 28000, dwcc: null,
  },
  cargo: {
    weightMt: 5000, cargoType: 'GRAIN', loadPort: 'Odessa', dischargePort: 'Rotterdam',
  },
  hardFilters: {
    draft: { passed: true }, crane: { passed: true }, volume: { passed: true },
  },
} as unknown as Match['worksheet'];

/** Hydrated-style match — what hydrate-demo-session.ts produces from seed rows. */
function hydratedMatch(): Match {
  return {
    cargoEmailId: 'cargo-1',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-1',
    vesselItemIndex: 0,
    score: 72,
    matchLevel: 'good',
    matchReasons: ['hydrated from seed'],
    issues: [],
    fitPercent: 72,
    worksheet: WORKSHEET,
  } as unknown as Match;
}

/** Engine-style match — what POST /api/ai/match puts into session.matches
 *  (pair-analyzer output: fit computed, scoreBreakdown present, NO worksheet). */
function engineMatch(): Match {
  return {
    cargoEmailId: 'cargo-1',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-1',
    vesselItemIndex: 0,
    score: 70,
    matchLevel: 'good',
    matchReasons: ['engine recompute'],
    issues: [],
    fitPercent: 70.5,
    scoreBreakdown: { components: [], finalScore: 70 } as unknown as Match['scoreBreakdown'],
    // worksheet: ABSENT — pair-analyzer never sets it
  } as unknown as Match;
}

describe('refreshComputed must not clobber row data the refresh source cannot supply (audit B.6 blast-radius)', () => {
  it('worksheet_json survives a re-persist from engine output (no m.worksheet)', () => {
    const db = makeDb();

    // Render 1 — hydrated matches (demo login flow).
    persistSessionMatches(db, 'sess-1', [hydratedMatch()], [CARGO], [VESSEL]);
    const before = db
      .prepare("SELECT worksheet_json FROM matches WHERE user_id = 'sess-1'")
      .get() as { worksheet_json: string | null };
    expect(before.worksheet_json).not.toBeNull(); // sanity: hydrate persisted the worksheet

    // Render 2 — session.matches replaced by engine output (Run Matching /
    // /processing auto-pipeline), same email pair, no worksheet.
    persistSessionMatches(db, 'sess-1', [engineMatch()], [CARGO], [VESSEL]);
    const after = db
      .prepare("SELECT worksheet_json FROM matches WHERE user_id = 'sess-1'")
      .get() as { worksheet_json: string | null };

    // Campaign invariant: the match must render identically regardless of
    // which path last touched it — the comparison table / laycan_display /
    // bucket-reason card must not vanish because the refresh source lacks a
    // worksheet. Pre-B.6 (INSERT OR IGNORE) this row kept its worksheet.
    expect(after.worksheet_json).not.toBeNull();
  });

  it('engine-supplied fields DO refresh in the same flow (control: refresh works as intended)', () => {
    const db = makeDb();
    persistSessionMatches(db, 'sess-1', [hydratedMatch()], [CARGO], [VESSEL]);
    persistSessionMatches(db, 'sess-1', [engineMatch()], [CARGO], [VESSEL]);
    const row = db
      .prepare("SELECT reason, fit_percent FROM matches WHERE user_id = 'sess-1'")
      .get() as { reason: string; fit_percent: number | null };
    // The refresh itself is desirable for fields the engine CAN supply.
    expect(row.reason).toBe('engine recompute');
    expect(row.fit_percent).toBe(70.5);
  });
});
