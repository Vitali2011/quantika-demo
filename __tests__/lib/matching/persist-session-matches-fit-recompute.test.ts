/**
 * H1 behavioral tests: fit_breakdown economics component is recomputed from
 * the live tce_usd_per_day (not carried from stale seed).
 *
 * Before fix: persistSessionMatches stored m.fitPercent/m.fitBreakdown as-is
 * (seed values from regen time). Live TCE from computeStoredMatchEconomics was
 * stored in tce_usd_per_day but never fed back into fitBreakdown economics.
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
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { FIT_WEIGHTS } from '@/lib/sailing/fit-breakdown';
import { getBalticDayRate } from '@/lib/market/baltic-freight';
import type { Match, ParsedCargo, ParsedVessel, FitBreakdown } from '@/lib/types';

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
  migration046.up(db);
  migration047.up(db);
  return db;
}

const SESSION = 'test-h1-fit-recompute';

// Odesa→Rotterdam, 28k DWT, GRAIN — same pair as canonical-tce test
const CARGO: ParsedCargo = {
  emailId: 'cargo-h1', itemIndex: 0,
  originPort: { value: 'UAODS', confidence: 'confirmed' },
  destinationPort: { value: 'NLRTM', confidence: 'confirmed' },
  weightMt: { value: 5000, confidence: 'confirmed' },
  cargoType: 'GRAIN',
  freightRateUsd: null,
  missingInfo: [],
} as unknown as ParsedCargo;

const VESSEL: ParsedVessel = {
  emailId: 'vessel-h1', itemIndex: 0,
  dwtSummer: { value: 28000, confidence: 'confirmed' },
  speedLaden: '12 kn',
  consumption: '22 mt/day',
  restrictions: [],
  specialFeatures: [],
} as unknown as ParsedVessel;

/**
 * Build a seed FitBreakdown where economics score = FIT_WEIGHTS.economics (max = 18),
 * representing a match computed when seed TCE was $9,084/day (well above 3000 breakeven).
 * Non-economics component scores are neutral/moderate.
 */
function makeSeedFitBreakdown(): FitBreakdown {
  const econMax = FIT_WEIGHTS.economics; // 18
  return {
    components: [
      { factor: 'utilisation', label: 'Utilisation', weight: 19, score: 14, rationale: 'ok' },
      { factor: 'timing', label: 'Timing', weight: 15, score: 12, rationale: 'ok' },
      { factor: 'ballast', label: 'Ballast', weight: 15, score: 12, rationale: 'ok' },
      { factor: 'classFit', label: 'Class Fit', weight: 9, score: 7, rationale: 'ok' },
      { factor: 'cargoType', label: 'Cargo Type', weight: 6, score: 5, rationale: 'ok' },
      { factor: 'cranes', label: 'Cranes', weight: 6, score: 5, rationale: 'ok' },
      { factor: 'volume', label: 'Volume', weight: 3, score: 2, rationale: 'ok' },
      { factor: 'draft', label: 'Draft', weight: 2, score: 2, rationale: 'ok' },
      { factor: 'vetting', label: 'Vetting', weight: 7, score: 6, rationale: 'ok' },
      {
        factor: 'economics', label: 'Economics (TCE)', weight: econMax, score: econMax,
        rationale: 'TCE $9,084/day — $6,084/day above class breakeven.',
      },
    ],
    totalWeight: 100,
    fitPercent: 83, // non-economics sum(65) + econMax(18) = 83
    partCargo: false,
    vesselClass: 'handysize',
    sanctionsPenalty: 0,
    chartererPenalty: 0,
    appliedCap: null,
    inputs: { distanceNm: 2000, gapDays: 0, verdict: 'on-time', utilisation: 0.18, vesselDwt: 28000, cargoWtMax: 5000 },
  };
}

function makeSeedMatch(seedBreakdown: FitBreakdown): Match {
  return {
    cargoEmailId: 'cargo-h1',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-h1',
    vesselItemIndex: 0,
    score: 85,
    matchLevel: 'good',
    matchReasons: ['Seed match'],
    issues: [],
    fitPercent: seedBreakdown.fitPercent,
    fitBreakdown: seedBreakdown,
  };
}

describe('persistSessionMatches — economics fit recomputed from live TCE (H1)', () => {
  beforeEach(() => {
    mockBaltic.mockReset();
    // Very low Baltic → live TCE well below 3000 breakeven for 28k DWT
    mockBaltic.mockReturnValue({ usdPerDay: 500, date: '2026-06-01', indexCode: 'BHSI_TC' });
  });

  it('fit_percent stored is lower than seed when live TCE is below breakeven', () => {
    const db = freshDb();
    const seedBreakdown = makeSeedFitBreakdown();
    persistSessionMatches(db, SESSION, [makeSeedMatch(seedBreakdown)], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION, sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].fit_percent).not.toBeNull();
    // Live TCE (500/day Baltic) is below 3000 breakeven for 28k DWT
    // → economics score drops → overall fitPercent must be lower than seed 83
    expect(rows[0].fit_percent!).toBeLessThan(seedBreakdown.fitPercent);
    db.close();
  });

  it('stored fit_breakdown economics rationale reflects live TCE (not seed $9,084/day)', () => {
    const db = freshDb();
    const seedBreakdown = makeSeedFitBreakdown();
    persistSessionMatches(db, SESSION + '-r', [makeSeedMatch(seedBreakdown)], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION + '-r', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].fit_breakdown).not.toBeNull();

    const stored = JSON.parse(rows[0].fit_breakdown!) as FitBreakdown;
    const econComp = stored.components.find((c) => c.factor === 'economics');
    expect(econComp).toBeDefined();
    // Rationale must NOT still say the seed TCE figure
    expect(econComp!.rationale).not.toContain('9,084');
    // With live TCE below breakeven, rationale must say "below class breakeven"
    expect(econComp!.rationale).toMatch(/below class breakeven/i);
    db.close();
  });

  it('stored fit_breakdown economics score is lower than max when live TCE is below breakeven', () => {
    const db = freshDb();
    persistSessionMatches(db, SESSION + '-s', [makeSeedMatch(makeSeedFitBreakdown())], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION + '-s', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    const stored = JSON.parse(rows[0].fit_breakdown!) as FitBreakdown;
    const econComp = stored.components.find((c) => c.factor === 'economics');
    expect(econComp!.score).toBeLessThan(FIT_WEIGHTS.economics); // < 18
    db.close();
  });

  it('stored fit_breakdown fitPercent equals stored fit_percent column (consistency)', () => {
    const db = freshDb();
    persistSessionMatches(db, SESSION + '-c', [makeSeedMatch(makeSeedFitBreakdown())], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION + '-c', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    const stored = JSON.parse(rows[0].fit_breakdown!) as FitBreakdown;
    // fitPercent inside the blob must equal the SQL column
    expect(stored.fitPercent).toBe(rows[0].fit_percent);
    db.close();
  });

  it('match without fitBreakdown (no seed breakdown): fit_percent stays null (no regression)', () => {
    // Real session match without seed breakdown should be unaffected
    mockBaltic.mockReturnValue({ usdPerDay: 25000, date: '2026-06-01', indexCode: 'BHSI_TC' });
    const db = freshDb();
    const matchNoBreakdown: Match = {
      cargoEmailId: 'cargo-h1',
      cargoItemIndex: 0,
      vesselEmailId: 'vessel-h1',
      vesselItemIndex: 0,
      score: 85,
      matchLevel: 'good',
      matchReasons: [],
      issues: [],
      // fitPercent and fitBreakdown intentionally absent
    };
    persistSessionMatches(db, SESSION + '-nb', [matchNoBreakdown], [CARGO], [VESSEL]);

    const rows = listMatches(db, { user_id: SESSION + '-nb', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    // No breakdown → no recompute → fit columns null
    expect(rows[0].fit_percent).toBeNull();
    expect(rows[0].fit_breakdown).toBeNull();
    db.close();
  });
});
