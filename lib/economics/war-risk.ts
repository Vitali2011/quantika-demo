export interface HraZone {
  name: string;
  premiumPercent: number; // annual % of vessel value per day in zone
  ports: string[];        // port name keywords that trigger detection
  canals?: string[];      // canal keywords
}

export const JWC_HRA_ZONES: HraZone[] = [
  {
    name: 'Gulf of Guinea HRA',
    premiumPercent: 0.05,
    ports: ['lagos', 'apapa', 'tema', 'abidjan', 'cotonou', 'bonny', 'tin can', 'lome', 'dakar', 'conakry'],
  },
  {
    name: 'Red Sea / Bab al-Mandeb HRA',
    premiumPercent: 0.075,
    ports: ['aden', 'hodeidah', 'djibouti', 'berbera', 'jeddah', 'yanbu', 'salalah'],
    canals: ['suez'],
  },
  {
    name: 'Indian Ocean / Somali Corridor HRA',
    premiumPercent: 0.04,
    ports: ['mogadishu', 'mombasa', 'dar es salaam', 'mumbai', 'nhava sheva', 'mundra', 'kandla', 'karachi'],
    canals: ['suez'],
  },
  {
    name: 'Black Sea Russia/Ukraine HRA',
    premiumPercent: 0.10,
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
  daysInHra: number;
}

export interface WarRiskResult {
  premiumUsd: number;
  zones: string[];
}

export function calculateWarRiskPremium(input: WarRiskInput): WarRiskResult {
  const { route, vesselValueUsd, daysInHra } = input;

  if (daysInHra <= 0) {
    return { premiumUsd: 0, zones: [] };
  }

  const fromLower = route.fromPort.toLowerCase();
  const toLower = route.toPort.toLowerCase();
  const viaLower = (route.viaCanal ?? '').toLowerCase();

  const matchedZones: HraZone[] = [];

  for (const zone of JWC_HRA_ZONES) {
    const portMatch = zone.ports.some(p =>
      fromLower.includes(p) || toLower.includes(p)
    );
    const canalMatch = zone.canals?.some(c => viaLower.includes(c)) ?? false;

    if (portMatch || canalMatch) {
      matchedZones.push(zone);
    }
  }

  if (matchedZones.length === 0) {
    return { premiumUsd: 0, zones: [] };
  }

  // Use highest premium zone rate
  const maxPremiumPercent = Math.max(...matchedZones.map(z => z.premiumPercent));
  // Annual % → daily rate × days in HRA
  const dailyRate = (maxPremiumPercent / 100) / 365;
  const premiumUsd = Math.round(vesselValueUsd * dailyRate * daysInHra * 100) / 100;

  return {
    premiumUsd,
    zones: matchedZones.map(z => z.name),
  };
}
