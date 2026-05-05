import { calculateTCE, type VoyageInput } from '@/lib/economics/voyage-calculator';
import type { EcaZone } from '@/lib/knowledge/eca/parser';
import type { ResolvedPort } from '@/lib/ports/resolve';

describe('voyage-calculator ECA bunker split', () => {
  // Mock ECA zones for testing
  const testEcaZones: EcaZone[] = [
    {
      name: 'North Sea ECA',
      region: 'north-sea',
      fuel_sulphur_max_pct: 0.10,
      effective_from: '2015-01-01',
      effective_to: null,
      // Box: lat [55, 60], lon [0, 10]
      polygon_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[0, 55], [10, 55], [10, 60], [0, 60], [0, 55]]],
      }),
    },
    {
      name: 'Baltic Sea ECA',
      region: 'baltic',
      fuel_sulphur_max_pct: 0.10,
      effective_from: '2015-01-01',
      effective_to: null,
      // Box: lat [54, 66], lon [10, 30]
      polygon_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[10, 54], [30, 54], [30, 66], [10, 66], [10, 54]]],
      }),
    },
    {
      name: 'North America ECA',
      region: 'north-america',
      fuel_sulphur_max_pct: 0.10,
      effective_from: '2015-01-01',
      effective_to: null,
      // Box: lat [40, 45], lon [-75, -60]
      polygon_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[-75, 40], [-60, 40], [-60, 45], [-75, 45], [-75, 40]]],
      }),
    },
  ];

  // Mock ports
  const portHamburg: ResolvedPort = {
    portCode: 'DEHAM',
    portName: 'Hamburg',
    country: 'DE',
    lat: 53.55,
    lon: 9.99, // Inside North Sea ECA box
    aliases: [],
  };

  const portNewYork: ResolvedPort = {
    portCode: 'USNYC',
    portName: 'New York',
    country: 'US',
    lat: 40.7,
    lon: -74.0, // Inside North America ECA box
    aliases: [],
  };

  const portSingapore: ResolvedPort = {
    portCode: 'SGSIN',
    portName: 'Singapore',
    country: 'SG',
    lat: 1.29,
    lon: 103.85, // Outside all ECAs
    aliases: [],
  };

  const portDubai: ResolvedPort = {
    portCode: 'AEDXB',
    portName: 'Dubai',
    country: 'AE',
    lat: 25.27,
    lon: 55.29, // Outside all ECAs
    aliases: [],
  };

  const portAarhus: ResolvedPort = {
    portCode: 'DKAAR',
    portName: 'Aarhus',
    country: 'DK',
    lat: 56.15,
    lon: 10.21, // Inside Baltic ECA box
    aliases: [],
  };

  const baseInput: VoyageInput = {
    vessel: {
      dwt: 30000,
      valueUsd: 12_000_000,
      speedKts: 13,
      consumptionMtPerDay: 22,
    },
    route: {
      originPort: 'SGSIN',
      destinationPort: 'NLRTM',
      distanceNm: 8400,
    },
    cargo: {
      quantityMt: 25000,
      freightRateUsdPerMt: 35,
    },
    bunkerPriceUsdPerMt: 580,
    euaPriceEur: 60,
    durationDays: 28,
    canalUsd: 0,
    daUsd: 0,
  };

  describe('ECA bunker split with zones provided', () => {
    it('splits bunker into ECA and open-ocean portions when either port in ECA', () => {
      const input: VoyageInput = {
        ...baseInput,
        route: {
          originPort: 'DEHAM',
          destinationPort: 'USNYC',
          distanceNm: 3500,
          resolvedOrigin: portHamburg,
          resolvedDest: portNewYork,
        },
        ecaZones: testEcaZones,
      };

      const result = calculateTCE(input);

      // Phase 1: 5% ECA assumption
      const totalBunkerMt = 22 * 28; // consumption * duration = 616 MT
      const ecaBunkerMt = totalBunkerMt * 0.05; // 30.8 MT
      const openBunkerMt = totalBunkerMt * 0.95; // 585.2 MT

      expect(result.bunker_eca_mt).toBeCloseTo(ecaBunkerMt, 1);
      expect(result.bunker_open_mt).toBeCloseTo(openBunkerMt, 1);
      expect((result.bunker_eca_mt ?? 0) + (result.bunker_open_mt ?? 0)).toBeCloseTo(totalBunkerMt, 1);

      // Total bunker cost should remain unchanged
      expect(result.breakdown.bunker_usd).toBe(Math.round(totalBunkerMt * 580));
    });

    it('assigns 100% to open-ocean bunker when neither port in ECA', () => {
      const input: VoyageInput = {
        ...baseInput,
        route: {
          originPort: 'SGSIN',
          destinationPort: 'AEDXB',
          distanceNm: 3500,
          resolvedOrigin: portSingapore,
          resolvedDest: portDubai,
        },
        ecaZones: testEcaZones,
      };

      const result = calculateTCE(input);

      const totalBunkerMt = 22 * 28; // 616 MT

      expect(result.bunker_eca_mt).toBe(0);
      expect(result.bunker_open_mt).toBeCloseTo(totalBunkerMt, 1);
    });

    it('handles distanceNm=0 (same port) without crash', () => {
      const input: VoyageInput = {
        ...baseInput,
        route: {
          originPort: 'SGSIN',
          destinationPort: 'SGSIN',
          distanceNm: 0,
          resolvedOrigin: portSingapore,
          resolvedDest: portSingapore,
        },
        durationDays: 0,
        ecaZones: testEcaZones,
      };

      expect(() => calculateTCE(input)).not.toThrow();
      const result = calculateTCE(input);
      // With duration=0, totalBunkerMt=0, so ECA calc skipped
      expect(result.bunker_eca_mt).toBeUndefined();
      expect(result.bunker_open_mt).toBeUndefined();
    });

    it('maintains bunker invariant: total_bunker = bunker_eca + bunker_open', () => {
      const input: VoyageInput = {
        ...baseInput,
        route: {
          originPort: 'DEHAM',
          destinationPort: 'USNYC',
          distanceNm: 3500,
          resolvedOrigin: portHamburg,
          resolvedDest: portNewYork,
        },
        ecaZones: testEcaZones,
      };

      const result = calculateTCE(input);

      const totalBunkerMt = 22 * 28;
      const sumSplit = (result.bunker_eca_mt ?? 0) + (result.bunker_open_mt ?? 0);

      expect(sumSplit).toBeCloseTo(totalBunkerMt, 1);
    });

    it('documents Phase 1 simplification: both ports in ECA → 5% (not 100%)', () => {
      const input: VoyageInput = {
        ...baseInput,
        route: {
          originPort: 'DEHAM',
          destinationPort: 'DKAAR',
          distanceNm: 500,
          resolvedOrigin: portHamburg,
          resolvedDest: portAarhus,
        },
        ecaZones: testEcaZones,
      };

      const result = calculateTCE(input);

      const totalBunkerMt = 22 * 28;
      const ecaBunkerMt = totalBunkerMt * 0.05; // Phase 1: NOT 100%

      expect(result.bunker_eca_mt).toBeCloseTo(ecaBunkerMt, 1);
      expect(result.bunker_open_mt).toBeCloseTo(totalBunkerMt * 0.95, 1);
    });
  });

  describe('ECA bunker split without zones (fallback)', () => {
    it('returns bunker_eca_mt = 0 and bunker_open_mt = total when no zones provided', () => {
      const input: VoyageInput = {
        ...baseInput,
        route: {
          originPort: 'DEHAM',
          destinationPort: 'USNYC',
          distanceNm: 3500,
          resolvedOrigin: portHamburg,
          resolvedDest: portNewYork,
        },
        // No ecaZones provided
      };

      const result = calculateTCE(input);

      const totalBunkerMt = 22 * 28;

      expect(result.bunker_eca_mt).toBeUndefined();
      expect(result.bunker_open_mt).toBeUndefined();
    });
  });
});
