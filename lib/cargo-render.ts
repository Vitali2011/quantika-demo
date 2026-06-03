import { isRange, type Range } from '@/lib/types';
import { safeRender } from '@/lib/ui-render';
import { formatNumber } from '@/lib/utils';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { fmtLaycan } from '@/lib/utils/fmt-laycan';
import { detectSpot } from '@/lib/sailing/readiness-gap';

/**
 * Format a raw cargo `laycan` string for the /cargo list & detail card.
 *
 * Gate5 #3: a spot/prompt laycan ("Spot — Prompt", "Spot — vessel's dates")
 * must render the "Spot" label — NOT a single collapsed day. The old path ran
 * parseLaycan → parseVesselOpenDate → today, producing "May 29–May 29". Matching
 * rebases spot cargoes onto a 10-day window; the cargo list only needs the label.
 *
 * Otherwise: parse to a date range and format; unparseable text passes through
 * raw; null/empty → null (renders "—"). Pure function — unit-testable.
 */
export function formatCargoLaycanDisplay(
  raw: string | null,
  refYear: number,
): string | null {
  if (!raw) return null;
  if (detectSpot(raw)) return 'Spot';
  const parsed = parseLaycan(raw, refYear);
  if (!parsed) return raw;
  return fmtLaycan(
    parsed.start.getTime(),
    parsed.end.getTime(),
  );
}

function fmtK(mt: number): string {
  if (mt >= 1000) {
    const k = Math.round((mt / 1000) * 10) / 10;
    return `${k}k`;
  }
  return String(mt);
}

/**
 * Compact k-notation formatter for the cargo list QTY column.
 * Ranges: "4,300–4,500" → "4.3–4.5k"; singles: 22000 → "22k".
 * Use formatQuantity for full-number display (cargo detail page).
 */
export function formatQuantityCompact(
  weightMt: number | null,
  q: Range<number> | number | null | undefined,
): string | null {
  if (weightMt !== null) return fmtK(weightMt);
  if (q == null) return null;
  if (isRange<number>(q)) {
    const { min, max } = q;
    if (min === max) return fmtK(min);
    if (min >= 1000 && max >= 1000) {
      const lo = Math.round((min / 1000) * 10) / 10;
      const hi = Math.round((max / 1000) * 10) / 10;
      return `${lo}–${hi}k`;
    }
    return `${fmtK(min)}–${fmtK(max)}`;
  }
  if (typeof q === 'number' && !isNaN(q)) return fmtK(q);
  return null;
}

/**
 * Format a quantity value (plain number or Range) into a human-readable string.
 * Returns null when the value is absent or invalid — callers skip rendering.
 * Pure function, no React deps — unit-testable in isolation.
 */
export function formatQuantity(q: Range<number> | number | null | undefined): string | null {
  if (q == null) return null;
  if (isRange<number>(q)) {
    const { min, max, unit } = q;
    const suffix = unit ? ` ${unit}` : '';
    if (min === max) return `${formatNumber(min)}${suffix}`;
    return `${formatNumber(min)}–${formatNumber(max)}${suffix}`;
  }
  if (typeof q === 'number' && !isNaN(q)) {
    return formatNumber(q);
  }
  return null;
}

/**
 * βf2-02: Normalise specialRequirements before rendering.
 *
 * The LLM parser sometimes returns an array of objects ({label, name, ...})
 * instead of the typed `string | null`. Coerce to readable text so the user
 * never sees "[object Object]" on the cargo page.
 *
 * Extracted from `app/cargo/[id]/page.tsx` (Next.js 16 forbids non-route
 * exports from page files — TS2344 against generated route-types).
 *
 * Pure function, no React deps — unit-testable in isolation.
 */
export function renderSpecialRequirements(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return value
      .map((it) =>
        typeof it === 'string'
          ? it
          : ((it as Record<string, unknown>).label ??
              (it as Record<string, unknown>).name ??
              JSON.stringify(it)),
      )
      .join(', ');
  }
  return safeRender(value as Parameters<typeof safeRender>[0]);
}
