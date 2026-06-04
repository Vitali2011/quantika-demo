/**
 * Integration test for #791 cause A — range cargo weight reaches fit-breakdown.
 *
 * Guards against regression on the apply-helper sweep (`resolveCargoWeight`):
 * a range cargo (`weightMt=null, weightMtMin=4000, weightMtMax=4800`) MUST
 * NOT produce "not stated" on the utilisation factor in computeFitBreakdown.
 */
import { computeFitBreakdown } from '@/lib/sailing/fit-breakdown';
import type {
  MatchHardFilters,
  MatchReadiness,
  MatchSanctions,
  ParsedCargo,
  ParsedVessel,
} from '@/lib/types';

const SANCTIONS_OK: MatchSanctions = { risk: 'NONE', blocking: false };
const HF_PASS: MatchHardFilters = {
  draft: { pass: true },
  crane: { pass: true },
  volume: { pass: true },
  cargoVessel: { pass: true },
  destDraft: { pass: true },
  destCrane: { pass: true },
  cargoWeight: { pass: true },
};

const READY: MatchReadiness = {
  openDate: '2026-09-13',
  laycanStart: '2026-09-15',
  laycanEnd: '2026-09-25',
  distanceNm: 100,
  distanceExact: true,
  speedKn: 11,
  sailingDays: 0.4,
  arrivalDate: '2026-09-14',
  gapDays: 1,
  verdict: 'ideal',
  explanation: 'ideal',
};

function makeRangeCargo(): ParsedCargo {
  return {
    emailId: 'e-range',
    itemIndex: 0,
    originPort: { value: 'Marmara', confidence: 'confirmed' },
    originCountry: null,
    destinationPort: { value: 'Constanța', confidence: 'confirmed' },
    destinationCountry: null,
    cargoDescription: { value: 'salt', confidence: 'confirmed' },
    weightMt: null,
    weightMtMin: 4000,
    weightMtMax: 4800,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: { value: '15-25 Sep', confidence: 'confirmed' },
    laycan: '15-25 Sep',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
  };
}

function makeGoodVessel(): ParsedVessel {
  return {
    emailId: 'v1',
    itemIndex: 0,
    vesselName: { value: 'TEST', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 5500, confidence: 'confirmed' },
    dwcc: { value: 5200, confidence: 'confirmed' },
    draftMax: null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: 7000,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: true,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Handysize Bulker',
    openPosition: { value: 'Istanbul', confidence: 'confirmed' },
    openDate: { value: '13 Sep', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: 'salt',
    speedLaden: '12',
    speedBallast: null,
    consumption: '20',
    deckCapacity: null,
    specialFeatures: [],
  };
}

describe('cargo-weight integration — range cargoes flow into fit/economics (#791)', () => {
  it('utilisation factor is NOT "not stated" for a range cargo with weightMt=null + weightMtMax=4800', () => {
    const bd = computeFitBreakdown({
      cargo: makeRangeCargo(),
      vessel: makeGoodVessel(),
      readiness: READY,
      sanctions: SANCTIONS_OK,
      hardFilters: HF_PASS,
      refYear: 2026,
    });

    const util = bd.components.find((c) => c.factor === 'utilisation');
    expect(util).toBeDefined();
    expect(util?.rationale ?? '').not.toMatch(/not stated/i);
  });

  it('utilisation contributes >0 weighted points for a range cargo (worst-case 4800 mt on 5200 dwcc)', () => {
    const bd = computeFitBreakdown({
      cargo: makeRangeCargo(),
      vessel: makeGoodVessel(),
      readiness: READY,
      sanctions: SANCTIONS_OK,
      hardFilters: HF_PASS,
      refYear: 2026,
    });

    const util = bd.components.find((c) => c.factor === 'utilisation');
    expect(util?.score).toBeGreaterThan(0);
  });
});
