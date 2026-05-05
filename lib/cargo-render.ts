import { safeRender } from '@/lib/ui-render';

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
