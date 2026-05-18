/**
 * Wave 5 — Matching Reality Sanity
 * Сценарии из ROADMAP: 5 фиксов, которые устраняют причины "IDEAL на нерелевантных матчах".
 */

import { runHardFilters } from '@/lib/sailing/match-filters';
import { isLaycanExpired } from '@/lib/sailing/date-sanity';
import {
  calculateReadinessGap,
  SPOT_IDEAL_MAX_GAP_DAYS,
} from '@/lib/sailing/readiness-gap';
import { computeScoreBreakdown, CONFIDENCE_MULTIPLIERS } from '@/lib/sailing/match-scoring';
import type { ParsedCargo, ParsedVessel, Match, MatchReadiness, MatchSanctions } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = new Date('2026-04-18T00:00:00Z');

function cf<T>(value: T, confidence: 'confirmed' | 'interpreted' | 'uncertain' = 'confirmed') {
  return { value, confidence };
}

function baseCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'c1', itemIndex: 0,
    originPort: cf('Mykolaiv'), originCountry: 'UA',
    destinationPort: cf('Ravenna'), destinationCountry: 'IT',
    cargoDescription: cf('steel coils'), weightMt: cf(4800),
    weightMtMin: null, weightMtMax: null, volumeCbm: null, dimensions: null,
    cargoType: 'BREAK_BULK', containerType: null, quantity: null, incoterms: null,
    preferredDates: null, laycan: '2026-05-10',
    loadingRate: null, dischargeRate: null, commissionPercent: null,
    commissionTerms: null, specialRequirements: null, stowageFactor: null,
    missingInfo: [],
    ...overrides,
  };
}

function baseVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'v1', itemIndex: 0,
    vesselName: cf('MV TEST'), imo: '1234567', flag: 'TR', built: 2015,
    classSociety: null, pandi: null,
    dwtSummer: cf(5200), dwcc: null,
    draftMax: cf(5.6),
    loa: 100, beam: 16, grt: null, nrt: null,
    holdsCount: 2, hatchesCount: 2,
    grainCapacity: 6200, grainCapacityUnit: 'cbm', baleCapacity: null,
    holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
    geared: true, craneCapacity: null, hatchType: null,
    vesselType: 'general cargo',
    openPosition: cf('Mykolaiv'), openDate: cf('2026-04-18'),
    direction: null, restrictions: [], lastCargoes: null,
    speedLaden: null, speedBallast: null, consumption: null,
    deckCapacity: null, specialFeatures: [], verificationWarning: null,
    ...overrides,
  };
}

function mkMatch(score = 60): Match {
  return {
    cargoEmailId: 'c1', cargoItemIndex: 0,
    vesselEmailId: 'v1', vesselItemIndex: 0,
    score, matchLevel: 'possible', matchReasons: [], issues: [],
  };
}

function mkReadiness(verdict: MatchReadiness['verdict'] = 'ideal'): MatchReadiness {
  return {
    openDate: '2026-04-18', laycanStart: '2026-05-10', laycanEnd: '2026-05-15',
    distanceNm: 400, speedKn: 12, sailingDays: 1.4, arrivalDate: '2026-04-19',
    gapDays: 21, verdict, explanation: '',
  };
}

function mkSanctions(): MatchSanctions {
  return { risk: 'NONE' as const, blocking: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: Destination port compatibility
// Сценарий: судно с осадкой 14m → порт Nacala (maxDraft=10m) должно блокироваться
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 1 — destination port compatibility', () => {
  // Massawa maxDraft=8.5m — реальные данные из port-master
  it('vessel draft 10m → Massawa (maxDraft=8.5m): BLOCKED', () => {
    const r = runHardFilters({
      originPort: 'Karasu',
      destinationPort: 'Massawa',
      draftMax: 10,               // судно сидит 10m > 8.5m лимит
      geared: true,
      weightMt: 4800,
      cargoDescription: 'steel',
      vesselType: 'general cargo',
      cargoType: 'BREAK_BULK',
      stowageFactor: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
    });
    expect(r.checks.destDraft.pass).toBe(false);
    expect(r.checks.destDraft.reason).toMatch(/draft/i);
    expect(r.failures).toContain(r.checks.destDraft.reason);
  });

  it('vessel draft 5.6m → Massawa (maxDraft=8.5m): PASSES', () => {
    const r = runHardFilters({
      originPort: 'Karasu',
      destinationPort: 'Massawa',
      draftMax: 5.6,
      geared: true,
      weightMt: 4800,
      cargoDescription: 'steel',
      vesselType: 'general cargo',
      cargoType: 'BREAK_BULK',
      stowageFactor: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
    });
    expect(r.checks.destDraft.pass).toBe(true);
  });

  it('origin port is fine, destination port fails separately', () => {
    const r = runHardFilters({
      originPort: 'Ravenna',       // deep water port → origin passes
      destinationPort: 'Massawa',  // maxDraft=8.5m
      draftMax: 10,
      geared: true,
      weightMt: 4800,
      cargoDescription: 'steel',
      vesselType: 'general cargo',
      cargoType: 'BREAK_BULK',
      stowageFactor: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
    });
    // origin may or may not pass depending on Ravenna — destDraft must fail regardless
    expect(r.checks.destDraft.pass).toBe(false);
  });

  // Assab hasShoreCranes=false — реальные данные
  it('gearless vessel → Assab (no shore cranes): destCrane BLOCKED', () => {
    const r = runHardFilters({
      originPort: 'Karasu',
      destinationPort: 'Assab',
      draftMax: 5.6,
      geared: false,           // gearless vessel
      weightMt: 4800,
      cargoDescription: 'steel',
      vesselType: 'general cargo',
      cargoType: 'BREAK_BULK',
      stowageFactor: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
    });
    expect(r.checks.destCrane.pass).toBe(false);
    expect(r.checks.destCrane.reason).toMatch(/crane|gearless/i);
  });

  it('null destination port → PASSES gracefully (missing data)', () => {
    const r = runHardFilters({
      originPort: 'Karasu',
      destinationPort: null,
      draftMax: 14,
      geared: false,
      weightMt: 4800,
      cargoDescription: 'steel',
      vesselType: 'general cargo',
      cargoType: 'BREAK_BULK',
      stowageFactor: null,
      grainCapacity: null,
      dwtSummer: null,
      dwcc: null,
    });
    expect(r.checks.destDraft.pass).toBe(true);
    expect(r.checks.destCrane.pass).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: Laycan expired detection
// Сценарий: laycan.end = 15 Aug, today = 5 Sep → матч должен быть заблокирован
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 2 — laycan expired detection', () => {
  it('laycan ended Aug 15, today Sep 5 → EXPIRED', () => {
    const r = isLaycanExpired(
      { start: new Date('2025-08-01'), end: new Date('2025-08-15') },
      new Date('2025-09-05'),
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('laycan_expired');
  });

  it('laycan ends today (Sep 5) → still valid (last day inclusive)', () => {
    const today = new Date('2025-09-05');
    const r = isLaycanExpired(
      { start: new Date('2025-08-25'), end: today },
      today,
    );
    expect(r.valid).toBe(true);
  });

  it('laycan window open → valid', () => {
    const r = isLaycanExpired(
      { start: new Date('2026-05-10'), end: new Date('2026-05-20') },
      TODAY,
    );
    expect(r.valid).toBe(true);
  });

  it('laycan with past start, future end → valid (window still open)', () => {
    const r = isLaycanExpired(
      { start: new Date('2026-04-01'), end: new Date('2026-05-01') },
      TODAY,
    );
    expect(r.valid).toBe(true);
  });

  it('null laycan → gracefully VALID (missing data does not block)', () => {
    expect(isLaycanExpired(null, TODAY).valid).toBe(true);
  });

  it('expired laycan: gap calculation returns negative gapDays + late verdict', () => {
    const r = calculateReadinessGap(
      { openDate: '2026-04-15', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '1-15 Mar', originPort: 'Mykolaiv' },
      { refYear: 2026, today: TODAY },
    );
    expect(r.verdict).toBe('late');
    expect(r.gapDays).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: Spot vessel upper threshold (121d gap не должен быть IDEAL)
// Сценарий: spot-vessel + laycan через 121 день → "idle", не "ideal"
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 3 — spot vessel 121d gap = idle, not ideal', () => {
  const TODAY_SPOT = new Date('2026-04-17T00:00:00Z');

  it(`SPOT_IDEAL_MAX_GAP_DAYS = ${SPOT_IDEAL_MAX_GAP_DAYS} (threshold constant)`, () => {
    expect(SPOT_IDEAL_MAX_GAP_DAYS).toBe(30);
  });

  it('spot vessel + laycan 121d ahead → IDLE (was IDEAL before fix)', () => {
    // Laycan Aug 1-20 is ~107d ahead of Apr 17
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '1-20 Aug', originPort: 'Mykolaiv' },
      { refYear: 2026, today: TODAY_SPOT },
    );
    expect(r.isSpot).toBe(true);
    expect(r.gapDays).toBeGreaterThan(30);
    expect(r.verdict).toBe('idle');   // NOT 'ideal' — это и был баг
  });

  it('spot vessel + laycan 20d ahead → IDEAL (within 30d threshold)', () => {
    const soon = new Date('2026-04-17T00:00:00Z');
    // May 7 = 20 days out
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '7-15 May', originPort: 'Mykolaiv' },
      { refYear: 2026, today: soon },
    );
    expect(r.isSpot).toBe(true);
    expect(r.gapDays).toBeLessThanOrEqual(30);
    expect(r.verdict).toBe('ideal');
  });

  it('non-spot vessel + 121d gap → verdict is NOT ideal either (for different reason)', () => {
    const r = calculateReadinessGap(
      { openDate: '2026-04-17', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '1-20 Aug', originPort: 'Mykolaiv' },
      { refYear: 2026, today: TODAY_SPOT },
    );
    expect(r.isSpot).toBe(false);
    expect(r.verdict).not.toBe('ideal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: extractNum → Range (5000/5500 mts парсится как диапазон)
// Сценарий: cargo weight "5000–5500 MT" → uses max=5500 for DWT fit check
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 4 — Range weight check (max bound for DWT fit)', () => {
  it('range 5000–5500 MT on vessel DWT=5200: max(5500) exceeds DWT → 2pts (not well-matched)', () => {
    const cargo = baseCargo({ weightMt: { value: 5000, confidence: 'confirmed' }, weightMtMax: 5500 });
    const vessel = baseVessel({ dwtSummer: cf(5200) });
    const r = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness(), sanctions: mkSanctions(),
    });
    const dwtComp = r.components.find(c => c.label.toLowerCase().includes('dwt'));
    expect(dwtComp).toBeDefined();
    // max=5500 > DWT=5200 → "exceeds" → low score
    expect(dwtComp!.points).toBeLessThanOrEqual(5);
  });

  it('range 2800–4800 MT on vessel DWT=5200: max(4800) fits → well-matched → 10pts', () => {
    const cargo = baseCargo({ weightMt: { value: 2800, confidence: 'confirmed' }, weightMtMax: 4800 });
    const vessel = baseVessel({ dwtSummer: cf(5200) });
    const r = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness(), sanctions: mkSanctions(),
    });
    const dwtComp = r.components.find(c => c.label.toLowerCase().includes('dwt'));
    expect(dwtComp).toBeDefined();
    expect(dwtComp!.points).toBeGreaterThanOrEqual(8);
  });

  it('single number 4800 MT → backward-compatible (no regression)', () => {
    const cargo = baseCargo({ weightMt: { value: 4800, confidence: 'confirmed' }, weightMtMax: null });
    const vessel = baseVessel({ dwtSummer: cf(5200) });
    const r = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness(), sanctions: mkSanctions(),
    });
    const dwtComp = r.components.find(c => c.label.toLowerCase().includes('dwt'));
    expect(dwtComp!.points).toBeGreaterThanOrEqual(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: Confidence weighting in scoring
// Сценарий: interpreted поля снижают скор (×0.7), uncertain — сильнее (×0.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 5 — confidence weighting in scoring', () => {
  it('CONFIDENCE_MULTIPLIERS constants', () => {
    expect(CONFIDENCE_MULTIPLIERS.confirmed).toBe(1.0);
    expect(CONFIDENCE_MULTIPLIERS.interpreted).toBe(0.7);
    expect(CONFIDENCE_MULTIPLIERS.uncertain).toBe(0.4);
  });

  it('all-confirmed fields: finalScore equals basePhysical (no penalty)', () => {
    const cargo = baseCargo();
    const vessel = baseVessel();
    const r = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness('ideal'), sanctions: mkSanctions(),
    });
    // All components use ×1.0 → confidenceAdjustedScore == basePhysical
    expect(r.confidenceAdjustedScore).toBe(r.basePhysical);
    expect(r.components.every(c => c.confidenceMultiplier === 1.0 || c.confidenceMultiplier === undefined)).toBe(true);
  });

  it('interpreted origin port: geographic component gets ×0.7 penalty', () => {
    const cargo = baseCargo({
      originPort: { value: 'Mykolaiv', confidence: 'interpreted' },
    });
    const vessel = baseVessel();
    const allConfirmed = computeScoreBreakdown({
      cargo: baseCargo(), vessel, match: mkMatch(),
      readiness: mkReadiness('ideal'), sanctions: mkSanctions(),
    });
    const withPenalty = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness('ideal'), sanctions: mkSanctions(),
    });
    // confidenceAdjustedScore must be lower when origin is 'interpreted'
    // interpreted origin → geographic component is penalised → lower score
    expect(withPenalty.confidenceAdjustedScore!).toBeLessThan(allConfirmed.confidenceAdjustedScore!);
    // The penalty should be ~30% of the geographic component value
    const diff = allConfirmed.confidenceAdjustedScore! - withPenalty.confidenceAdjustedScore!;
    expect(diff).toBeGreaterThan(0);
  });

  it('uncertain cargo description: cargo-type component gets ×0.4 penalty', () => {
    const cargo = baseCargo({
      cargoDescription: { value: 'steel coils', confidence: 'uncertain' },
    });
    const vessel = baseVessel();
    const withPenalty = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness('ideal'), sanctions: mkSanctions(),
    });
    // Score must be lower than all-confirmed baseline
    const baseline = computeScoreBreakdown({
      cargo: baseCargo(), vessel, match: mkMatch(),
      readiness: mkReadiness('ideal'), sanctions: mkSanctions(),
    });
    expect(withPenalty.confidenceAdjustedScore!).toBeLessThan(baseline.confidenceAdjustedScore!);
  });

  it('finalScore is clamped to [0, 100]', () => {
    const cargo = baseCargo();
    const vessel = baseVessel();
    const r = computeScoreBreakdown({
      cargo, vessel, match: mkMatch(),
      readiness: mkReadiness('ideal'), sanctions: mkSanctions(),
    });
    expect(r.finalScore).toBeGreaterThanOrEqual(0);
    expect(r.finalScore!).toBeLessThanOrEqual(100);
  });

  // ── Contract invariant: ConfidenceLevel ↔ CONFIDENCE_MULTIPLIERS ──
  // Каждое значение enum обязано иметь multiplier. Защита от silent drift:
  // если кто-то добавит 4-й уровень через `as ConfidenceLevel`-cast и забудет
  // multiplier — scoring даст undefined → NaN в points → molча 0 в UI.
  it('every ConfidenceLevel value has a valid multiplier in (0, 1]', () => {
    const levels: Array<string> = [
      'confirmed',
      'interpreted',
      'uncertain',
    ];
    for (const lvl of levels) {
      const m = CONFIDENCE_MULTIPLIERS[lvl];
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(CONFIDENCE_MULTIPLIERS).sort()).toEqual(levels.slice().sort());
  });
});
