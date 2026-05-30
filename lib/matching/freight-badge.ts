import type { FreightRateSource } from '@/lib/matching/tce-calculator';

/**
 * UI badge metadata for a resolved freight-rate source (Wave #7, L2 #7).
 * Shared by EconomicsTab and the matches list so the badge stays consistent.
 * Pure (no React) → unit-testable.
 */
export type FreightBadgeTone = 'manual' | 'parsed' | 'baltic' | 'estimate';

export interface FreightBadge {
  label: string;
  title: string;
  tone: FreightBadgeTone;
  /** estimate tier → the TCE number should be visually muted ("rate not confirmed"). */
  dimmed: boolean;
}

/**
 * Map a persisted `freight_rate_source` (free-text string) to its badge. Unknown
 * or null sources fall back to the estimate badge — the honest default when the
 * provenance is unclear.
 */
export function freightBadge(
  source: FreightRateSource | string | null | undefined,
  balticDate?: string | null,
): FreightBadge {
  switch (source) {
    case 'manual':
      return { label: '✎ Manual', title: 'Broker-entered rate (kept until reset)', tone: 'manual', dimmed: false };
    case 'parsed':
      return { label: '✓ From email', title: 'Freight rate parsed from the email', tone: 'parsed', dimmed: false };
    case 'baltic':
      return {
        label: balticDate ? `~ Market (Baltic ${balticDate})` : '~ Market (Baltic)',
        title: 'Derived from the Baltic timecharter index',
        tone: 'baltic',
        dimmed: false,
      };
    case 'estimated':
    default:
      return {
        label: '≈ Estimate',
        title: 'Heuristic estimate — rate not confirmed',
        tone: 'estimate',
        dimmed: true,
      };
  }
}

/** Tailwind classes per tone (chip background + text). */
export const FREIGHT_BADGE_CLASSES: Record<FreightBadgeTone, string> = {
  manual: 'bg-blue-100 text-blue-700',
  parsed: 'bg-emerald-100 text-emerald-700',
  baltic: 'bg-sky-100 text-sky-700',
  estimate: 'bg-amber-100 text-amber-700',
};
