import { calibrateConfidence, calibrateAll } from '../validation/confidence-calibration';
import type { ConfidenceField } from '../types';

describe('calibrateConfidence', () => {
  it('downgrades confirmed→interpreted when sourceText contains "abt"', () => {
    const f: ConfidenceField<number> = { value: 5000, confidence: 'confirmed', sourceText: 'abt 5000 mts' };
    expect(calibrateConfidence(f)?.confidence).toBe('interpreted');
  });

  it.each(['~', 'circa', 'approx', 'about', 'around', 'approximately'])(
    'downgrades confirmed when sourceText contains hedge word "%s"',
    (word) => {
      const f: ConfidenceField<string> = { value: 'v', confidence: 'confirmed', sourceText: `${word} some value` };
      expect(calibrateConfidence(f)?.confidence).toBe('interpreted');
    }
  );

  it('does not double-downgrade interpreted', () => {
    const f: ConfidenceField<string> = { value: 'v', confidence: 'interpreted', sourceText: 'abt 5k' };
    expect(calibrateConfidence(f)?.confidence).toBe('interpreted');
  });

  it('does not touch uncertain', () => {
    const f: ConfidenceField<string> = { value: 'v', confidence: 'uncertain', sourceText: 'abt' };
    expect(calibrateConfidence(f)?.confidence).toBe('uncertain');
  });

  it('stays confirmed when no hedge word', () => {
    const f: ConfidenceField<string> = { value: 'Rotterdam', confidence: 'confirmed', sourceText: 'Load: Rotterdam FHINC' };
    expect(calibrateConfidence(f)?.confidence).toBe('confirmed');
  });

  it('stays confirmed when no sourceText', () => {
    const f: ConfidenceField<number> = { value: 5000, confidence: 'confirmed' };
    expect(calibrateConfidence(f)?.confidence).toBe('confirmed');
  });

  it('returns null for null input', () => {
    expect(calibrateConfidence(null)).toBeNull();
  });

  it('is case-insensitive (ABT)', () => {
    const f: ConfidenceField<number> = { value: 5000, confidence: 'confirmed', sourceText: 'ABT 5000 MT' };
    expect(calibrateConfidence(f)?.confidence).toBe('interpreted');
  });
});

describe('calibrateAll', () => {
  it('applies calibration to each ConfidenceField in an object', () => {
    const obj = {
      name: 'plain string',
      weightMt: { value: 5000, confidence: 'confirmed' as const, sourceText: 'abt 5000 mts' },
      originPort: { value: 'Rotterdam', confidence: 'confirmed' as const, sourceText: 'Load: Rotterdam' },
      nullField: null,
    };
    const result = calibrateAll(obj);
    expect((result.weightMt as ConfidenceField<number>).confidence).toBe('interpreted');
    expect((result.originPort as ConfidenceField<string>).confidence).toBe('confirmed');
    expect(result.nullField).toBeNull();
    expect(result.name).toBe('plain string');
  });
});
