import type { ConfidenceField } from '@/lib/types';

const HEDGE_PATTERN = /\b(abt|circa|approx|about|around|approximately)\b|~/i;

export function calibrateConfidence<T>(
  field: ConfidenceField<T> | null | undefined
): ConfidenceField<T> | null {
  if (field == null) return null;
  if (field.confidence !== 'confirmed') return field;
  if (!field.sourceText) return field;
  if (HEDGE_PATTERN.test(field.sourceText)) {
    return { ...field, confidence: 'interpreted' };
  }
  return field;
}

function isConfidenceField(v: unknown): v is ConfidenceField<unknown> {
  return (
    v !== null &&
    typeof v === 'object' &&
    'value' in v &&
    'confidence' in v
  );
}

// Walks top-level values of a plain object, applies calibrateConfidence
// to each ConfidenceField-shaped value. Non-CF values pass through unchanged.
export function calibrateAll<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (isConfidenceField(val)) {
      (result as Record<string, unknown>)[key] = calibrateConfidence(val);
    }
  }
  return result;
}
