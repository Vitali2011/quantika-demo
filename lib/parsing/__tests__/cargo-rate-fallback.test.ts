import { applyCargoRateFallback, applyCargoTypeFallback } from '../cargo-rate-fallback';
import { ParsedCargo } from '../../types';

function makeCargo(overrides: Partial<ParsedCargo>): ParsedCargo {
  return {
    emailId: 'test',
    itemIndex: 0,
    originPort: null,
    originCountry: null,
    destinationPort: null,
    destinationCountry: null,
    cargoDescription: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: null,
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

describe('applyCargoRateFallback', () => {
  it('populates loadingRate and dischargeRate from "FIO SHINC" in body', () => {
    const body = 'Loading: FIO SHINC\nDisch: FIO SHINC\nLaycan: 1/5 May 2025';
    const cargo = makeCargo({ loadingRate: null, dischargeRate: null });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.loadingRate).toBe('FIO SHINC');
    expect(result.dischargeRate).toBe('FIO SHINC');
  });

  it('populates both rates from "CQD both ends"', () => {
    const body = 'Cargo: sunflower meal\nCQD both ends\nLaycan: May 2025';
    const cargo = makeCargo({ loadingRate: null, dischargeRate: null });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.loadingRate).toBe('CQD both ends');
    expect(result.dischargeRate).toBe('CQD both ends');
  });

  it('populates both rates from standalone "CQD"', () => {
    const body = 'Rate: CQD\nCommission: 2.5%';
    const cargo = makeCargo({ loadingRate: null, dischargeRate: null });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.loadingRate).toBe('CQD');
    expect(result.dischargeRate).toBe('CQD');
  });

  it('does NOT override if LLM already populated loadingRate', () => {
    const body = 'Loading: FIO SHINC';
    const cargo = makeCargo({ loadingRate: '5000 MT/day SHINC', dischargeRate: null });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.loadingRate).toBe('5000 MT/day SHINC');
  });

  it('does NOT override if LLM already populated dischargeRate', () => {
    const body = 'CQD both ends';
    const cargo = makeCargo({ loadingRate: null, dischargeRate: '3000 MT/day' });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.dischargeRate).toBe('3000 MT/day');
  });

  it('extracts MT/day SHINC pattern', () => {
    const body = '5,000 MT SHINC both ends';
    const cargo = makeCargo({ loadingRate: null, dischargeRate: null });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.loadingRate).toBe('5,000 MT SHINC');
    expect(result.dischargeRate).toBe('5,000 MT SHINC');
  });

  it('returns cargo unchanged when no patterns match', () => {
    const body = 'Cargo: wheat 5000mt FOB Novorossiysk';
    const cargo = makeCargo({ loadingRate: null, dischargeRate: null });
    const result = applyCargoRateFallback(cargo, body);
    expect(result.loadingRate).toBeNull();
    expect(result.dischargeRate).toBeNull();
  });
});

describe('applyCargoTypeFallback', () => {
  it('downgrades BREAK_BULK to BULK when description contains "loose"', () => {
    const cargo = makeCargo({
      cargoType: 'BREAK_BULK',
      cargoDescription: { value: 'steel scrap loose', confidence: 'confirmed', sourceText: 'steel scrap loose' },
    });
    const result = applyCargoTypeFallback(cargo);
    expect(result.cargoType).toBe('BULK');
  });

  it('does NOT downgrade when description does NOT contain "loose"', () => {
    const cargo = makeCargo({
      cargoType: 'BREAK_BULK',
      cargoDescription: { value: 'steel coils bundled', confidence: 'confirmed', sourceText: 'steel coils bundled' },
    });
    const result = applyCargoTypeFallback(cargo);
    expect(result.cargoType).toBe('BREAK_BULK');
  });

  it('does NOT touch BULK type even if description has "loose"', () => {
    const cargo = makeCargo({
      cargoType: 'BULK',
      cargoDescription: { value: 'loose grain', confidence: 'confirmed', sourceText: 'loose grain' },
    });
    const result = applyCargoTypeFallback(cargo);
    expect(result.cargoType).toBe('BULK');
  });

  it('handles null cargoDescription without throwing', () => {
    const cargo = makeCargo({ cargoType: 'BREAK_BULK', cargoDescription: null });
    const result = applyCargoTypeFallback(cargo);
    expect(result.cargoType).toBe('BREAK_BULK');
  });
});
