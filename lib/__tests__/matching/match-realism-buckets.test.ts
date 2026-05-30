/**
 * Match-realism buckets — levers 1 + 2 + 5 (handover 2026-05-30).
 *
 * Contract under test (NEW): analyzePairs partitions its non-blocked pairs into
 *   - matches            : main "worth calling" list (good/possible, evaluable, timing OK)
 *   - lowConfidenceMatches: weak score OR idle with a large date gap ("manual review")
 *   - insufficientData   : unknown verdict (no distance/dates — can't evaluate)
 *   - blockedMatches     : hard-filter / date / late / sanctions (unchanged)
 *
 * Levers:
 *   1. score cutoff + trim sweep  → weak pairs leave the main list (→ lowConfidence)
 *   2. idle hard                  → idle with gap > IDLE_HARD_MAX_GAP_DAYS leaves main (→ lowConfidence)
 *   5. unknown not a match        → unknown leaves main (→ insufficientData), even though it scores ≥40
 *
 * No data is lost: every non-blocked pair lands in exactly one of the three buckets.
 */

import fs from 'fs';
import path from 'path';
import {
  analyzePairs,
  IDLE_HARD_MAX_GAP_DAYS,
  type AiScorer,
} from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { classifyVesselByDwt } from '@/lib/sailing/readiness-gap';
import {
  BALLAST_GOOD_MAX_NM,
  PROPORTION_GOOD_MIN_UTIL,
  isPartCargo,
} from '@/lib/sailing/match-scoring';

const offline: AiScorer = jest.fn().mockResolvedValue([]);

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'c-1',
    itemIndex: 0,
    originPort: { value: 'Mykolaiv', confidence: 'confirmed' },
    originCountry: 'Ukraine',
    destinationPort: { value: 'Rotterdam', confidence: 'interpreted' },
    destinationCountry: 'Netherlands',
    cargoDescription: { value: 'wheat in bulk', confidence: 'confirmed' },
    weightMt: { value: 4000, confidence: 'confirmed' },
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: '15-25 Sep 2026',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    ...overrides,
  };
}

function makeVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'v-1',
    itemIndex: 0,
    vesselName: { value: 'MV TEST', confidence: 'confirmed' },
    imo: null,
    flag: 'Panama',
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 8000, confidence: 'confirmed' },
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
    geared: true,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'BULK',
    openPosition: { value: 'Karasu', confidence: 'interpreted' },
    openDate: { value: '13 Sep 2026', confidence: 'interpreted' },
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

const TODAY = new Date('2026-09-05T00:00:00Z');

describe('analyzePairs — bucket routing (levers 1+2+5)', () => {
  it('exposes the three new buckets even on empty input', async () => {
    const result = await analyzePairs([], [], offline, { refYear: 2026, today: TODAY });
    expect(Array.isArray(result.matches)).toBe(true);
    expect(Array.isArray(result.lowConfidenceMatches)).toBe(true);
    expect(Array.isArray(result.insufficientData)).toBe(true);
    expect(Array.isArray(result.blockedMatches)).toBe(true);
  });

  it('lever 5: unknown verdict (unknown port) → insufficientData, NOT main', async () => {
    // Karasu→Atlantis: distance unknown → verdict "unknown". Scores ~40 ("possible")
    // but must NOT appear in the main list.
    const cargos = [makeCargo({ originPort: { value: 'Atlantis', confidence: 'interpreted' } })];
    const vessels = [makeVessel()];
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: TODAY });

    expect(result.matches).toHaveLength(0);
    expect(result.lowConfidenceMatches).toHaveLength(0);
    expect(result.insufficientData).toHaveLength(1);
    expect(result.insufficientData[0].readiness?.verdict).toBe('unknown');
  });

  it('lever 2: idle with large gap (open ~9mo before laycan) → lowConfidence, NOT main', async () => {
    const cargos = [makeCargo()]; // laycan 15-25 Sep 2026
    const vessels = [makeVessel({ openDate: { value: '1 Jan 2026', confidence: 'interpreted' } })];
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: new Date('2026-01-01T00:00:00Z') });

    expect(result.matches).toHaveLength(0);
    expect(result.insufficientData).toHaveLength(0);
    expect(result.lowConfidenceMatches).toHaveLength(1);
    const p = result.lowConfidenceMatches[0];
    expect(p.readiness?.verdict).toBe('idle');
    expect(p.readiness?.gapDays).not.toBeNull();
    expect(p.readiness!.gapDays!).toBeGreaterThan(IDLE_HARD_MAX_GAP_DAYS);
  });

  it('positive control: ideal-timing evaluable pair → main list', async () => {
    // open 13 Sep, laycan 15-25 Sep, Karasu→Mykolaiv 315nm → arrives ~14 Sep → gap ≈ 1 → ideal
    const cargos = [makeCargo()];
    const vessels = [makeVessel()];
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: TODAY });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].readiness?.verdict).toBe('ideal');
    expect(result.matches[0].matchLevel).not.toBe('weak');
    expect(result.lowConfidenceMatches).toHaveLength(0);
    expect(result.insufficientData).toHaveLength(0);
  });
});

describe('analyzePairs — demo realism (79×51), levers 1+2+5', () => {
  const cargos = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../sample-data/demo-parsed-cargoes.json'), 'utf8'),
  ) as ParsedCargo[];
  const vessels = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../sample-data/demo-parsed-vessels.json'), 'utf8'),
  ) as ParsedVessel[];

  // 2026-05-01 is the funnel's best-case date (fewest expired laycans → upper bound).
  const DEMO_TODAY = new Date(Date.UTC(2026, 4, 1));

  it('main list collapses far below the ~1402 raw baseline', async () => {
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: DEMO_TODAY });
    // Pre-fix the main list == 1402 (every non-blocked pair). New contract: only
    // good/possible with meaningful timing remain in main.
    // Wave A (2026-05-30) raised this bound from <200 to <450: improved port
    // coverage (12 real ports + aliases) resolves distances that were previously
    // `unknown` (→ insufficientData), so more pairs are now evaluable and land in
    // the main list (~322). The collapse vs the 1402 raw baseline still holds, and
    // it stays under the founder's "~450 is too many" ceiling. Variety + per-date
    // stability are guarded by __tests__/research/match-realism-stability.test.ts.
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.length).toBeLessThan(450);
  });

  it('main list excludes unknown, large-gap idle, and weak', async () => {
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: DEMO_TODAY });
    for (const m of result.matches) {
      expect(m.readiness?.verdict).not.toBe('unknown');
      expect(m.matchLevel).not.toBe('weak');
      const isLargeIdle =
        m.readiness?.verdict === 'idle' &&
        m.readiness?.gapDays != null &&
        m.readiness.gapDays > IDLE_HARD_MAX_GAP_DAYS;
      expect(isLargeIdle).toBe(false);
    }
  });

  it('moved pairs are preserved in buckets (not lost)', async () => {
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: DEMO_TODAY });
    expect(result.insufficientData.length).toBeGreaterThan(0);
    expect(result.lowConfidenceMatches.length).toBeGreaterThan(0);

    // Every insufficientData entry is unknown.
    for (const m of result.insufficientData) {
      expect(m.readiness?.verdict).toBe('unknown');
    }
    // Every lowConfidence entry is weak OR large-gap idle.
    for (const m of result.lowConfidenceMatches) {
      const isLargeIdle =
        m.readiness?.verdict === 'idle' &&
        m.readiness?.gapDays != null &&
        m.readiness.gapDays > IDLE_HARD_MAX_GAP_DAYS;
      expect(m.matchLevel === 'weak' || isLargeIdle).toBe(true);
    }
  });

  it('conservation: every pair lands in exactly one bucket (no data lost)', async () => {
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: DEMO_TODAY });
    const total =
      result.matches.length +
      result.lowConfidenceMatches.length +
      result.insufficientData.length +
      result.blockedMatches.length;
    expect(total).toBe(cargos.length * vessels.length);
  });

  // ── Wave C — ballast + size hard cap (levers 3 + 4) ────────────────────────
  // After the cap, a 'good' main match must respect its vessel-class ballast
  // radius (lever 3) and, unless it is a part-cargo, the minimum utilisation
  // (lever 4). A pair that violates either is demoted to 'possible' (it still
  // shows, flagged), so it can no longer be 'good'.

  it('lever 3: every main "good" match is within its vessel-class ballast radius', async () => {
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: DEMO_TODAY });
    const offenders = result.matches.filter((m) => {
      if (m.matchLevel !== 'good') return false;
      const dist = m.readiness?.distanceNm;
      if (dist == null) return false;
      const vessel = vessels.find(
        (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
      );
      const dwt = vessel ? cfValue(vessel.dwtSummer) : null;
      if (dwt == null) return false; // unknown DWT → ballast guard skipped (conservative)
      const cls = classifyVesselByDwt(dwt);
      return dist > BALLAST_GOOD_MAX_NM[cls];
    });
    expect(offenders).toHaveLength(0);
  });

  it('lever 4: every main "good" non-part-cargo match meets the minimum utilisation', async () => {
    const result = await analyzePairs(cargos, vessels, offline, { refYear: 2026, today: DEMO_TODAY });
    const offenders = result.matches.filter((m) => {
      if (m.matchLevel !== 'good') return false;
      const cargo = cargos.find(
        (c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex,
      );
      const vessel = vessels.find(
        (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
      );
      if (!cargo || !vessel) return false;
      if (isPartCargo(cfValue(cargo.cargoDescription))) return false;
      const dwcc = cfValue(vessel.dwcc);
      const dwt = cfValue(vessel.dwtSummer);
      const cap = dwcc != null && dwcc > 0 ? dwcc : dwt != null && dwt > 0 ? dwt : null;
      const wt = cargo.weightMtMax ?? cfValue(cargo.weightMt);
      if (cap == null || wt == null || wt <= 0) return false;
      return wt / cap < PROPORTION_GOOD_MIN_UTIL;
    });
    expect(offenders).toHaveLength(0);
  });

  it('legit part-cargo low-util pairs are NOT demoted out of good (exemption holds)', async () => {
    // Synthetic part-cargo: 5% util, short ballast, ideal timing → stays good.
    const partCargo = makeCargo({
      emailId: 'pc-1',
      cargoDescription: { value: 'Mobile machinery, part cargo', confidence: 'confirmed' },
      weightMt: { value: 400, confidence: 'confirmed' },
      cargoType: 'BREAK_BULK',
    });
    const bigVessel = makeVessel({
      emailId: 'pv-1',
      vesselType: 'general cargo',
      dwtSummer: { value: 8000, confidence: 'confirmed' },
    });
    const result = await analyzePairs([partCargo], [bigVessel], offline, { refYear: 2026, today: TODAY });
    // It must survive in the main list (not bucketed) and keep a non-weak tier;
    // crucially it carries NO SIZE: cap flag despite ~5% utilisation.
    const all = [...result.matches, ...result.lowConfidenceMatches];
    const pc = all.find((m) => m.cargoEmailId === 'pc-1');
    expect(pc).toBeDefined();
    expect((pc!.issues ?? []).some((i) => i.startsWith('SIZE:'))).toBe(false);
  });
});
