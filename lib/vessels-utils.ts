import type { ConfidenceField } from '@/lib/types';

/**
 * Extract a display string from a vessel openDate ConfidenceField.
 * The LLM may return .value as a plain string OR as {open, close, display}
 * for date ranges (per parse-vessel prompt). If the value is an object,
 * prefer .display (human-readable), then .open (ISO date).
 */
export function fmtOpenDate(field: ConfidenceField<string> | null | undefined): string | null {
  if (!field) return null;
  const val: unknown = field.value;
  if (typeof val === 'string') {
    if (!val) return null;
    if (val.includes('T')) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      }
    }
    return val;
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as { display?: string | null; open?: string | null };
    return obj.display ?? obj.open ?? null;
  }
  return null;
}
