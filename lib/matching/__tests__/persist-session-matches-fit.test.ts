/**
 * Behavioral test — persistSessionMatches writes fit_percent + fit_breakdown
 * when migration 042 columns are present.
 *
 * PI2: real DB + real function call (client.get() analog — direct function invocation).
 * Regression guard for #702 (fit-% never reached the DB before this PR).
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { resolveSyntheticCargo, resolveSyntheticVessel } from '@/lib/sample-data/synthetic-economics';
import type { Match, FitBreakdown } from '@/lib/types';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  return db;
}

const SAMPLE_FIT_BREAKDOWN: FitBreakdown = {
  components: [
    { factor: 'utilisation', label: 'Size / utilisation', weight: 25, score: 22, rationale: '88% utilisation — well-laden' },
    { factor: 'timing', label: 'Timing', weight: 20, score: 18, rationale: 'vessel arrives 3 days before laycan opens' },
    { factor: 'ballast', label: 'Ballast distance', weight: 20, score: 14, rationale: '320nm ballast — within Handymax radius' },
    { factor: 'classFit', label: 'Class fit', weight: 12, score: 10, rationale: 'Supramax matches cargo size well' },
    { factor: 'cargoType', label: 'Cargo type', weight: 8, score: 7, rationale: 'grain — no special handling needed' },
    { factor: 'cranes', label: 'Cranes', weight: 8, score: 6, rationale: 'geared vessel, port may lack shore cranes' },
    { factor: 'volume', label: 'Volume / stowage', weight: 4, score: 3, rationale: 'stowage factor compatible' },
    { factor: 'draft', label: 'Draft', weight: 3, score: 2, rationale: 'draft fits port restrictions' },
  ],
  totalWeight: 100,
  fitPercent: 82,
  partCargo: false,
  vesselClass: 'supramax',
  sanctionsPenalty: 0,
  appliedCap: null,
  inputs: {
    distanceNm: 320,
    gapDays: 3,
    verdict: 'ready',
    utilisation: 0.88,
    vesselDwt: 57000,
    cargoWtMax: 50000,
  },
};

const MATCH_WITH_FIT: Match = {
  cargoEmailId: 'demo-cargo-economics',
  cargoItemIndex: 0,
  vesselEmailId: 'demo-vessel-economics',
  vesselItemIndex: 0,
  score: 89,
  matchLevel: 'good',
  matchReasons: ['Good DWT fit — 58,000 mt vessel vs 50,000 mt grain cargo'],
  issues: [],
  fitPercent: 82,
  fitBreakdown: SAMPLE_FIT_BREAKDOWN,
};

describe('persistSessionMatches — fit_percent + fit_breakdown write-through (#702)', () => {
  const now = new Date();
  const demoCargo = resolveSyntheticCargo(now);
  const demoVessel = resolveSyntheticVessel(now);

  it('persists fit_percent from Match.fitPercent', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-fit-1', [MATCH_WITH_FIT], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match).toBeDefined();
    expect(match.fit_percent).toBeCloseTo(82);
  });

  it('persists fit_breakdown JSON from Match.fitBreakdown', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-fit-2', [MATCH_WITH_FIT], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match.fit_breakdown).not.toBeNull();
    const parsed = JSON.parse(match.fit_breakdown!);
    expect(parsed.fitPercent).toBe(82);
    expect(Array.isArray(parsed.components)).toBe(true);
    expect(parsed.components).toHaveLength(8);
    expect(parsed.components[0].factor).toBe('utilisation');
  });

  it('fit_percent is null when Match has no fitPercent', () => {
    const db = freshDb();
    const matchNoFit: Match = { ...MATCH_WITH_FIT, fitPercent: undefined, fitBreakdown: undefined };
    persistSessionMatches(db, 'session-fit-3', [matchNoFit], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match.fit_percent).toBeNull();
    expect(match.fit_breakdown).toBeNull();
  });

  it('8 fit components are all present in persisted breakdown', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-fit-4', [MATCH_WITH_FIT], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    const parsed = JSON.parse(match.fit_breakdown!);
    const factors = parsed.components.map((c: { factor: string }) => c.factor);
    expect(factors).toContain('utilisation');
    expect(factors).toContain('timing');
    expect(factors).toContain('ballast');
    expect(factors).toContain('classFit');
    expect(factors).toContain('cargoType');
    expect(factors).toContain('cranes');
    expect(factors).toContain('volume');
    expect(factors).toContain('draft');
  });
});
