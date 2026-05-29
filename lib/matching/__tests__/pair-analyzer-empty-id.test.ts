/**
 * Behavioral test — pair-analyzer rejects LLM matches with empty cargo/vessel IDs (#633)
 *
 * Root cause: when the AI LLM returns null/undefined cargo_email_id or vessel_email_id,
 * pair-analyzer previously mapped them to '' (empty string) AND the filteredOutKeys check
 * did NOT catch them (the empty-string key doesn't appear in filteredOutKeys, so the bad
 * entry slipped through into session.matches).
 *
 * A falsy cargoEmailId in session.matches causes:
 *   - MatchDetailPanel to show "Quote requires session data" (checks !cargoEmailId)
 *   - QuoteTab Generate button to be disabled (!cargoEmailId)
 *
 * Fix: explicit `!m.cargoEmailId || !m.vesselEmailId` guard in the filter chain.
 * The sweep still creates a valid match for the pair using the actual cargo/vessel emailId.
 *
 * PI2: calls real analyzePairs with a stubbed aiScorer — no string-match checks.
 */

import { analyzePairs } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

function makeCargo(emailId: string): ParsedCargo {
  return {
    emailId,
    itemIndex: 0,
    originPort: { value: 'CNSHA', confidence: 'confirmed' },
    originCountry: 'China',
    destinationPort: { value: 'NLRTM', confidence: 'confirmed' },
    destinationCountry: 'Netherlands',
    cargoDescription: null,
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
  };
}

function makeVessel(emailId: string): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV TEST', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: null,
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

const TODAY = new Date('2026-05-28T00:00:00Z');

describe('analyzePairs — empty-ID guard (#633)', () => {
  it('no match has empty cargoEmailId when LLM returns null cargo_email_id', async () => {
    const cargo = makeCargo('cargo-123');
    const vessel = makeVessel('vessel-456');

    const aiScorer = jest.fn().mockResolvedValue([
      // LLM returned null cargo_email_id — the bad entry must not reach session.matches
      { cargo_email_id: null, vessel_email_id: 'vessel-456', score: 80, match_level: 'good' },
    ]);

    const { matches } = await analyzePairs([cargo], [vessel], aiScorer, { today: TODAY });

    // The sweep picks up the pair with the real emailId — assert no empty-string cargoEmailId.
    // A falsy cargoEmailId in session.matches causes "Quote requires session data" (#633).
    expect(matches.every(m => !!m.cargoEmailId)).toBe(true);
    expect(matches.every(m => !!m.vesselEmailId)).toBe(true);
  });

  it('no match has empty vesselEmailId when LLM returns undefined vessel_email_id', async () => {
    const cargo = makeCargo('cargo-123');
    const vessel = makeVessel('vessel-456');

    const aiScorer = jest.fn().mockResolvedValue([
      { cargo_email_id: 'cargo-123', vessel_email_id: undefined, score: 75, match_level: 'possible' },
    ]);

    const { matches } = await analyzePairs([cargo], [vessel], aiScorer, { today: TODAY });

    expect(matches.every(m => !!m.cargoEmailId)).toBe(true);
    expect(matches.every(m => !!m.vesselEmailId)).toBe(true);
  });

  it('no match has empty-string cargoEmailId when LLM returns empty cargo_email_id', async () => {
    const cargo = makeCargo('cargo-123');
    const vessel = makeVessel('vessel-456');

    const aiScorer = jest.fn().mockResolvedValue([
      { cargo_email_id: '', vessel_email_id: 'vessel-456', score: 70 },
    ]);

    const { matches } = await analyzePairs([cargo], [vessel], aiScorer, { today: TODAY });

    // Every cargoEmailId must be truthy — '' would disable QuoteTab Generate button (#633)
    expect(matches.every(m => !!m.cargoEmailId)).toBe(true);
    expect(matches.every(m => !!m.vesselEmailId)).toBe(true);
  });

  it('valid LLM match is kept with correct IDs', async () => {
    const cargo = makeCargo('cargo-123');
    const vessel = makeVessel('vessel-456');

    const aiScorer = jest.fn().mockResolvedValue([
      { cargo_email_id: 'cargo-123', vessel_email_id: 'vessel-456', score: 85, match_level: 'good',
        match_reasons: ['DWT match'], issues: [] },
    ]);

    const { matches } = await analyzePairs([cargo], [vessel], aiScorer, { today: TODAY });

    expect(matches.length).toBeGreaterThan(0);
    // cargoEmailId must be truthy — MatchDetailPanel shows Generate Quote button iff truthy.
    expect(matches.every(m => !!m.cargoEmailId)).toBe(true);
    expect(matches.every(m => !!m.vesselEmailId)).toBe(true);
    const aiMatch = matches.find(m => m.cargoEmailId === 'cargo-123' && m.vesselEmailId === 'vessel-456');
    expect(aiMatch).toBeDefined();
  });

  it('mixed batch: valid match kept, null-ID match replaced by sweep with valid IDs', async () => {
    const cargo1 = makeCargo('cargo-111');
    const cargo2 = makeCargo('cargo-222');
    const vessel = makeVessel('vessel-456');

    const aiScorer = jest.fn().mockResolvedValue([
      { cargo_email_id: 'cargo-111', vessel_email_id: 'vessel-456', score: 90, match_level: 'good' },
      { cargo_email_id: null,        vessel_email_id: 'vessel-456', score: 70 },  // invalid — dropped
    ]);

    const { matches } = await analyzePairs([cargo1, cargo2], [vessel], aiScorer, { today: TODAY });

    // All matches must have valid IDs — no empty-string cargoEmailId
    expect(matches.every(m => !!m.cargoEmailId && !!m.vesselEmailId)).toBe(true);
    // The valid AI match must be present
    expect(matches.some(m => m.cargoEmailId === 'cargo-111')).toBe(true);
  });
});
