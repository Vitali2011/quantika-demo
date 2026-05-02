export interface HraZone {
  id: string;
  name: string;
  /**
   * Per-voyage premium as a fraction of vessel value (JWC 2024-26 rates).
   * Example: 0.0005 = 0.05% per transit.
   * Replaces previous `premiumPercent` (which was misinterpreted as
   * annual % and divided by 365 — see spec-betafix-04).
   */
  premiumPercentPerTransit: number;
  ports: string[];        // port name keywords that trigger detection
  canals?: string[];      // canal keywords
}

/**
 * Joint War Committee 2024-26 high-risk areas.
 * Rates are per-transit (per-voyage), NOT per-day.
 * Hull war premium = vessel_value × premiumPercentPerTransit.
 *
 * TODO(wave-γ): add crew war bonus (~$500/person × ~20 crew)
 * and P&I surcharge (~$5k flat) per voyage. For now hull-only.
 */
export const JWC_HRA_ZONES: HraZone[] = [
  {
    id: 'gulf-of-guinea',
    name: 'Gulf of Guinea HRA',
    premiumPercentPerTransit: 0.0005, // 0.05%
    ports: ['lagos', 'apapa', 'tema', 'abidjan', 'cotonou', 'bonny', 'tin can', 'lome', 'dakar', 'conakry'],
  },
  {
    id: 'red-sea-hra',
    name: 'Red Sea / Bab al-Mandeb HRA',
    premiumPercentPerTransit: 0.00075, // 0.075%
    ports: ['aden', 'hodeidah', 'djibouti', 'berbera', 'jeddah', 'yanbu', 'salalah', 'bab al mandab', 'bab el mandab'],
    canals: ['suez'],
  },
  {
    id: 'indian-ocean-hra',
    name: 'Indian Ocean / Somali Corridor HRA',
    premiumPercentPerTransit: 0.0004, // 0.04%
    ports: ['mogadishu', 'mombasa', 'dar es salaam', 'mumbai', 'nhava sheva', 'mundra', 'kandla', 'karachi'],
    canals: ['suez'],
  },
  {
    id: 'black-sea-hra',
    name: 'Black Sea Russia/Ukraine HRA',
    premiumPercentPerTransit: 0.001, // 0.10%
    ports: ['odessa', 'mykolaiv', 'kherson', 'mariupol', 'novorossiysk', 'tuapse', 'kerch', 'sevastopol', 'constanta', 'batumi'],
  },
];

export interface WarRiskInput {
  route: {
    fromPort: string;
    toPort: string;
    viaCanal?: string;
  };
  vesselValueUsd: number;
  /**
   * Retained for backward compatibility / telemetry. Per-voyage rate model
   * does NOT divide by days; daysInHra is informational only.
   */
  daysInHra?: number;
}

export interface WarRiskResult {
  applicable: boolean;
  premiumUsd: number;
  zones: string[];
  zoneIds: string[];
}

const VESSEL_VALUE_FALLBACK_USD = 8_000_000;

export function calculateWarRiskPremium(input: WarRiskInput): WarRiskResult {
  const { route, vesselValueUsd } = input;

  const fromLower = (route?.fromPort ?? '').toLowerCase().replace(/-/g, ' ');
  const toLower = (route?.toPort ?? '').toLowerCase().replace(/-/g, ' ');
  const viaLower = (route?.viaCanal ?? '').toLowerCase().replace(/-/g, ' ');

  const matchedZones: HraZone[] = [];
  for (const zone of JWC_HRA_ZONES) {
    const portMatch = zone.ports.some(p => {
      const re = new RegExp(`\\b${p}\\b`, 'i');
      return re.test(fromLower) || re.test(toLower);
    });
    const canalMatch = zone.canals?.some(c => viaLower.includes(c)) ?? false;
    if (portMatch || canalMatch) matchedZones.push(zone);
  }

  if (matchedZones.length === 0) {
    return { applicable: false, premiumUsd: 0, zones: [], zoneIds: [] };
  }

  // Defensive fallback: if vessel value missing/invalid, use industry default.
  const value =
    Number.isFinite(vesselValueUsd) && vesselValueUsd > 0
      ? vesselValueUsd
      : VESSEL_VALUE_FALLBACK_USD;

  // Use highest-risk matched zone (per JWC convention: dominant zone applies).
  const dominantZone = matchedZones.reduce((a, b) =>
    a.premiumPercentPerTransit >= b.premiumPercentPerTransit ? a : b,
  );

  // Per-voyage hull war premium = vessel_value × percent (NOT divided by 365).
  const hullPremium = value * dominantZone.premiumPercentPerTransit;
  const premiumUsd = Math.round(hullPremium * 100) / 100;

  return {
    applicable: true,
    premiumUsd,
    zones: matchedZones.map(z => z.name),
    zoneIds: matchedZones.map(z => z.id),
  };
}
