import { resolveCargoWeight } from '../cargo-weight';
import type { ParsedCargo } from '@/lib/types';

const baseCargo = (overrides: Partial<ParsedCargo> = {}): ParsedCargo =>
  ({
    emailId: 'e1',
    itemIndex: 0,
    originPort: { value: 'X', confidence: 'confirmed', sourceText: 'X' },
    originCountry: null,
    destinationPort: { value: 'Y', confidence: 'confirmed', sourceText: 'Y' },
    destinationCountry: null,
    cargoDescription: { value: 'Test cargo', confidence: 'confirmed', sourceText: 'test' },
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
  } as ParsedCargo);

describe('resolveCargoWeight', () => {
  it('returns null when weightMt and weightMtMax are both null', () => {
    expect(resolveCargoWeight(baseCargo())).toBeNull();
  });

  it('returns the ConfidenceField value when weightMt is wrapped', () => {
    const c = baseCargo({
      weightMt: { value: 3000, confidence: 'confirmed', sourceText: '3000mt' },
    });
    expect(resolveCargoWeight(c)).toBe(3000);
  });

  it('returns weightMtMax for range cargoes (worst-case)', () => {
    const c = baseCargo({ weightMt: null, weightMtMin: 4000, weightMtMax: 4800 });
    expect(resolveCargoWeight(c)).toBe(4800);
  });

  it('prefers weightMtMax over weightMt when both present (MOLOO ranges)', () => {
    const c = baseCargo({
      weightMt: { value: 28000, confidence: 'interpreted', sourceText: '28k MOLOO' },
      weightMtMin: 25200,
      weightMtMax: 30800,
    });
    expect(resolveCargoWeight(c)).toBe(30800);
  });

  it('returns null safely when cargo is null/undefined', () => {
    expect(resolveCargoWeight(null)).toBeNull();
    expect(resolveCargoWeight(undefined)).toBeNull();
  });

  it('handles plain-number weightMt (post-reparse aggregate from piece-weights)', () => {
    // After Task 4 re-parse, piece-summed aggregates land in weightMt as a ConfidenceField.
    const c = baseCargo({
      weightMt: {
        value: 186,
        confidence: 'interpreted',
        sourceText: '10 × 15,000 kg + 4 × 9,000 kg',
      },
    });
    expect(resolveCargoWeight(c)).toBe(186);
  });

  it('returns null when weightMtMax is non-finite (NaN guard)', () => {
    const c = baseCargo({ weightMtMax: Number.NaN as unknown as number });
    expect(resolveCargoWeight(c)).toBeNull();
  });

  it('returns null when both weightMt value and weightMtMax are zero/negative (no-quantity guard)', () => {
    const c = baseCargo({
      weightMt: { value: 0, confidence: 'confirmed' },
      weightMtMax: 0,
    });
    expect(resolveCargoWeight(c)).toBeNull();
  });
});
