import { extractNum, toConfidence } from '../parsing-utils';

describe('extractNum', () => {
  it('returns null for null', () => {
    expect(extractNum(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractNum(undefined)).toBeNull();
  });

  it('returns the number for a valid number', () => {
    expect(extractNum(42)).toBe(42);
    expect(extractNum(3.14)).toBe(3.14);
  });

  it('returns null for NaN', () => {
    expect(extractNum(NaN)).toBeNull();
  });

  it('parses a numeric string', () => {
    expect(extractNum('123')).toBe(123);
    expect(extractNum('45.6')).toBe(45.6);
  });

  it('returns null for a non-numeric string', () => {
    expect(extractNum('abc')).toBeNull();
    expect(extractNum('')).toBeNull();
  });

  it('extracts number from object with value field (number)', () => {
    expect(extractNum({ value: 99 })).toBe(99);
  });

  it('extracts number from object with value field (string)', () => {
    expect(extractNum({ value: '77' })).toBe(77);
  });

  it('returns null for object with non-numeric value', () => {
    expect(extractNum({ value: 'bad' })).toBeNull();
  });

  it('returns null for other types (boolean, array)', () => {
    expect(extractNum(true)).toBeNull();
    expect(extractNum([1, 2])).toBeNull();
  });
});

describe('toConfidence', () => {
  it('returns null for null', () => {
    expect(toConfidence(null)).toBeNull();
  });

  it('returns null for falsy values (0, empty string, false)', () => {
    expect(toConfidence(0)).toBeNull();
    expect(toConfidence('')).toBeNull();
    expect(toConfidence(false)).toBeNull();
  });

  it('returns ConfidenceField with confirmed for a primitive string', () => {
    expect(toConfidence<string>('Rotterdam')).toEqual({
      value: 'Rotterdam',
      confidence: 'confirmed',
    });
  });

  it('returns ConfidenceField with confirmed for a primitive number', () => {
    expect(toConfidence<number>(42)).toEqual({
      value: 42,
      confidence: 'confirmed',
    });
  });

  it('maps object with value to ConfidenceField, defaults confidence to confirmed', () => {
    expect(toConfidence<string>({ value: 'Hamburg' })).toEqual({
      value: 'Hamburg',
      confidence: 'confirmed',
      sourceText: undefined,
    });
  });

  it('maps object with value and confidence', () => {
    expect(toConfidence<string>({ value: 'Genoa', confidence: 'interpreted' })).toEqual({
      value: 'Genoa',
      confidence: 'interpreted',
      sourceText: undefined,
    });
  });

  it('maps object with value, confidence and source_text', () => {
    expect(toConfidence<string>({ value: 'Lagos', confidence: 'uncertain', source_text: 'may be Lagos' })).toEqual({
      value: 'Lagos',
      confidence: 'uncertain',
      sourceText: 'may be Lagos',
    });
  });

  it('ignores source_text if not a string', () => {
    const result = toConfidence<string>({ value: 'Dubai', source_text: 123 });
    expect(result?.sourceText).toBeUndefined();
  });
});
