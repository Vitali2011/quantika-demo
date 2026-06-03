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
 * Issue #178: crew war bonus and P&I surcharge added in WarRiskBreakdown.
 * premiumUsd remains hull-only for backward compat; use breakdown.totalPremiumUsd
 * for the full per-voyage cost.
 */
import type { ResolvedPort } from '@/lib/ports/resolve';

export const CREW_WAR_BONUS_PER_PERSON_USD = 500;
export const DEFAULT_CREW_COUNT = 20;
/** Default P&I surcharge for zones not in PI_SURCHARGE_BY_ZONE_ID. */
export const PI_SURCHARGE_USD = 5_000;

/**
 * Per-voyage P&I war surcharge by JWC zone ID (JWC 2024-26 + P&I club practice).
 * Dominant zone determines the surcharge. Falls back to PI_SURCHARGE_USD.
 */
export const PI_SURCHARGE_BY_ZONE_ID: Record<string, number> = {
  'gulf-of-guinea': 5_000,
  'red-sea-hra': 20_000,
  'indian-ocean-hra': 10_000,
  'black-sea-hra': 30_000,
  'persian-gulf-hra': 15_000,
};

export const JWC_HRA_ZONES: HraZone[] = [
  {
    id: 'gulf-of-guinea',
    name: 'Gulf of Guinea HRA',
    premiumPercentPerTransit: 0.0005, // 0.05%
    ports: ['lagos', 'apapa', 'tema', 'abidjan', 'cotonou', 'bonny', 'tin can', 'lome', 'dakar', 'conakry',
      // UNLOCODE codes for LOCODE-based detection (spec-04)
      'ngapp', 'nglos', 'ghtma', 'bjcoo', 'ciabd', 'ngbon', 'tglfw', 'sndkr', 'gnckr', 'bjtco'],
  },
  {
    id: 'red-sea-hra',
    name: 'Red Sea / Bab al-Mandeb HRA',
    premiumPercentPerTransit: 0.00075, // 0.075%
    ports: ['aden', 'hodeidah', 'djibouti', 'berbera', 'jeddah', 'yanbu', 'salalah', 'bab al mandab', 'bab el mandab',
      // UNLOCODE codes for LOCODE-based detection (spec-04)
      'sajed', 'egscd', 'djjib', 'yehod', 'soado'],
    canals: ['suez'],
  },
  {
    id: 'indian-ocean-hra',
    name: 'Indian Ocean / Somali Corridor HRA',
    premiumPercentPerTransit: 0.0004, // 0.04%
    ports: ['mogadishu', 'mombasa', 'dar es salaam', 'mumbai', 'nhava sheva', 'mundra', 'kandla', 'karachi',
      // UNLOCODE codes for LOCODE-based detection (spec-04)
      'inbom', 'pkqct', 'pkpnm', 'mzcpl'],
    canals: ['suez'],
  },
  {
    id: 'black-sea-hra',
    name: 'Black Sea Russia/Ukraine HRA',
    premiumPercentPerTransit: 0.001, // 0.10%
    ports: ['odessa', 'mykolaiv', 'kherson', 'mariupol', 'novorossiysk', 'tuapse', 'kerch', 'sevastopol', 'constanta', 'batumi',
      // UNLOCODE codes for LOCODE-based detection (spec-04)
      'uaods', 'uamyi', 'ruasi', 'uakhk', 'trist'],
  },
  {
    id: 'persian-gulf-hra',
    name: 'Persian Gulf / Strait of Hormuz HRA',
    // JWC JWLA-033 (2026): 0.5% per transit. Higher than other zones due to Iran/Hormuz risk.
    premiumPercentPerTransit: 0.005,
    ports: [
      // Port name keywords
      'bandar abbas', 'bandar imam', 'shahid rajaee', 'fujairah',
      'bahrain', 'mina salman', 'khalifa bin salman',
      'doha', 'ras laffan',
      'kuwait', 'shuaiba', 'shuwaikh',
      'dammam', 'jubail', 'ras tanura', 'khasab', 'hormuz',
      // UNLOCODE codes for LOCODE-based detection
      'irbnd', 'irbab', 'aefjr', 'aeauh',
      'bhbah', 'qadoh', 'qaral',
      'kwkwi', 'kwsub',
      'sadmm', 'sajub', 'sarta',
      'omkhb',
    ],
  },
];

export interface WarRiskInput {
  route: {
    /** Accepts either a ResolvedPort object or a plain port name string (BC). */
    fromPort: string | ResolvedPort;
    /** Accepts either a ResolvedPort object or a plain port name string (BC). */
    toPort: string | ResolvedPort;
    viaCanal?: string;
  };
  vesselValueUsd: number;
  /**
   * Retained for backward compatibility / telemetry. Per-voyage rate model
   * does NOT divide by days; daysInHra is informational only.
   */
  daysInHra?: number;
  /** Number of crew for war bonus calculation. Defaults to DEFAULT_CREW_COUNT (20). */
  crewCount?: number;
}

/** Per-voyage war risk cost breakdown (issue #178). Present only when applicable=true. */
export interface WarRiskBreakdown {
  hullPremiumUsd: number;
  crewWarBonusUsd: number;
  piSurchargeUsd: number;
  totalPremiumUsd: number;
}

export interface WarRiskResult {
  applicable: boolean;
  /** Hull war premium only. Unchanged for backward compat. Use breakdown.totalPremiumUsd for full cost. */
  premiumUsd: number;
  zones: string[];
  zoneIds: string[];
  /** Defined only when applicable=true. */
  breakdown?: WarRiskBreakdown;
}

const VESSEL_VALUE_FALLBACK_USD = 8_000_000;

/**
 * GoG (Gulf of Guinea) LOCODE set — known HRA ports matched by LOCODE
 * when a ResolvedPort is provided. This avoids relying solely on name keywords
 * for ports that may have been renamed or have unusual canonical names.
 */
const GOG_LOCODES = new Set(['NGAPP', 'NGLOS', 'GHTMA', 'BJCOO', 'CIABD', 'NGBON', 'TGLFW', 'SNDKR', 'GNCKR']);

/**
 * Extract all searchable strings for a port — name + aliases + LOCODE.
 * Works for both ResolvedPort objects and plain strings (BC).
 */
function portSearchTerms(port: string | ResolvedPort): string[] {
  if (typeof port === 'string') {
    return [port.toLowerCase().replace(/-/g, ' ')];
  }
  const terms = [
    port.portName.toLowerCase().replace(/-/g, ' '),
    ...port.aliases.map(a => a.toLowerCase().replace(/-/g, ' ')),
    port.portCode.toLowerCase(),
  ];
  return terms;
}

/**
 * Check if a port matches a zone's port keyword list.
 * Matches if ANY search term (name, alias, locode) contains ANY zone keyword.
 */
function portMatchesZone(port: string | ResolvedPort, zone: HraZone): boolean {
  const terms = portSearchTerms(port);

  // LOCODE-based check for known GoG ports (when ResolvedPort available)
  if (typeof port !== 'string' && zone.id === 'gulf-of-guinea' && GOG_LOCODES.has(port.portCode)) {
    return true;
  }

  return zone.ports.some(keyword => {
    const re = new RegExp(`\\b${keyword}\\b`, 'i');
    return terms.some(term => re.test(term));
  });
}

/**
 * Returns true if a free-text port string matches any JWC HRA zone keyword.
 * Used by hard-filter gate to detect war-risk open positions.
 */
export function isPortInHra(portText: string | null | undefined): boolean {
  if (!portText) return false;
  const lower = portText.toLowerCase().replace(/-/g, ' ');
  for (const zone of JWC_HRA_ZONES) {
    for (const keyword of zone.ports) {
      const re = new RegExp(`\\b${keyword}\\b`, 'i');
      if (re.test(lower)) return true;
    }
  }
  return false;
}

export function calculateWarRiskPremium(input: WarRiskInput): WarRiskResult {
  const { route, vesselValueUsd } = input;

  const fromPort = route?.fromPort ?? '';
  const toPort = route?.toPort ?? '';
  const viaLower = (route?.viaCanal ?? '').toLowerCase().replace(/-/g, ' ');

  const matchedZones: HraZone[] = [];
  for (const zone of JWC_HRA_ZONES) {
    const portMatch = portMatchesZone(fromPort, zone) || portMatchesZone(toPort, zone);
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

  const crewCount =
    Number.isFinite(input.crewCount) && (input.crewCount ?? 0) > 0
      ? input.crewCount!
      : DEFAULT_CREW_COUNT;
  const crewWarBonusUsd = CREW_WAR_BONUS_PER_PERSON_USD * crewCount;
  const piSurchargeUsd = PI_SURCHARGE_BY_ZONE_ID[dominantZone.id] ?? PI_SURCHARGE_USD;
  const breakdown: WarRiskBreakdown = {
    hullPremiumUsd: premiumUsd,
    crewWarBonusUsd,
    piSurchargeUsd,
    totalPremiumUsd: Math.round((premiumUsd + crewWarBonusUsd + piSurchargeUsd) * 100) / 100,
  };

  return {
    applicable: true,
    premiumUsd,
    zones: matchedZones.map(z => z.name),
    zoneIds: matchedZones.map(z => z.id),
    breakdown,
  };
}
