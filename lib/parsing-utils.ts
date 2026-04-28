import type { ConfidenceField } from '@/lib/types';

type ParseConfidence = 'confirmed' | 'interpreted' | 'uncertain';

export function extractNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n; }
  if (typeof v === 'object' && v !== null && 'value' in v) return extractNum((v as { value: unknown }).value);
  return null;
}

export function extractStr(data: unknown, key: string): string | null {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
  const val = (data as Record<string, unknown>)[key];
  if (typeof val === 'string' && val.length > 0) return val;
  return null;
}

export function toConfidence<T>(field: unknown): ConfidenceField<T> | null {
  if (!field) return null;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const f = field as { value: unknown; confidence?: unknown; source_text?: unknown };
    return {
      value: f.value as T,
      confidence: (f.confidence as ParseConfidence | undefined) || 'confirmed',
      sourceText: typeof f.source_text === 'string' ? f.source_text : undefined,
    };
  }
  return { value: field as T, confidence: 'confirmed' };
}
