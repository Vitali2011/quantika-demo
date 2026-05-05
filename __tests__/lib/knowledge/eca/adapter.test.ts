import { isPortInEca, calculateEcaFuelPortion } from '@/lib/knowledge/eca/adapter';
import type { EcaZone } from '@/lib/knowledge/eca/parser';

describe('ECA adapter', () => {
  const testZones: EcaZone[] = [
    {
      name: 'North Sea ECA',
      region: 'north-sea',
      fuel_sulphur_max_pct: 0.10,
      effective_from: '2015-01-01',
      effective_to: null,
      // Simple box: lat [55, 60], lon [0, 10]
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
      // Simple box: lat [54, 66], lon [10, 30]
      polygon_geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[10, 54], [30, 54], [30, 66], [10, 66], [10, 54]]],
      }),
    },
  ];

  describe('isPortInEca', () => {
    it('returns true when port is inside an ECA zone', () => {
      const port = { lat: 57, lon: 5 }; // Inside North Sea ECA
      expect(isPortInEca(port, testZones)).toBe(true);
    });

    it('returns true when port is in the second ECA zone', () => {
      const port = { lat: 60, lon: 20 }; // Inside Baltic Sea ECA
      expect(isPortInEca(port, testZones)).toBe(true);
    });

    it('returns false when port is outside all ECA zones', () => {
      const port = { lat: 40, lon: -10 }; // Atlantic, outside all ECAs
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when zones array is empty', () => {
      const port = { lat: 57, lon: 5 };
      expect(isPortInEca(port, [])).toBe(false);
    });

    it('returns false when lat is NaN', () => {
      const port = { lat: NaN, lon: 5 };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lon is NaN', () => {
      const port = { lat: 57, lon: NaN };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lat is Infinity', () => {
      const port = { lat: Infinity, lon: 5 };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lon is -Infinity', () => {
      const port = { lat: 57, lon: -Infinity };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lat > 90 (invalid)', () => {
      const port = { lat: 91, lon: 5 };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lat < -90 (invalid)', () => {
      const port = { lat: -91, lon: 5 };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lon > 180 (invalid)', () => {
      const port = { lat: 57, lon: 181 };
      expect(isPortInEca(port, testZones)).toBe(false);
    });

    it('returns false when lon < -180 (invalid)', () => {
      const port = { lat: 57, lon: -181 };
      expect(isPortInEca(port, testZones)).toBe(false);
    });
  });

  describe('calculateEcaFuelPortion', () => {
    const portInsideNorthSea = { lat: 57, lon: 5, locode: 'GBLON' };
    const portInsideBaltic = { lat: 60, lon: 20, locode: 'DEHAM' };
    const portOutside = { lat: 40, lon: -10, locode: 'ESALG' };

    it('returns 0.05 when origin is in ECA and dest is outside (Phase 1 simplification)', () => {
      const result = calculateEcaFuelPortion(portInsideNorthSea, portOutside, testZones);
      expect(result).toBe(0.05);
    });

    it('returns 0.05 when dest is in ECA and origin is outside (Phase 1 simplification)', () => {
      const result = calculateEcaFuelPortion(portOutside, portInsideBaltic, testZones);
      expect(result).toBe(0.05);
    });

    it('returns 0.05 when both ports are in ECA (Phase 1: NOT 100%, documented trade-off)', () => {
      const result = calculateEcaFuelPortion(portInsideNorthSea, portInsideBaltic, testZones);
      expect(result).toBe(0.05);
    });

    it('returns 0.0 when neither port is in any ECA (open ocean only)', () => {
      const port1 = { lat: 40, lon: -10, locode: 'ESALG' };
      const port2 = { lat: 35, lon: -20, locode: 'PTLIS' };
      const result = calculateEcaFuelPortion(port1, port2, testZones);
      expect(result).toBe(0.0);
    });

    it('returns 0.0 when zones array is empty', () => {
      const result = calculateEcaFuelPortion(portInsideNorthSea, portOutside, []);
      expect(result).toBe(0.0);
    });

    it('throws when origin lat is NaN', () => {
      const badPort = { lat: NaN, lon: 5, locode: 'TEST' };
      expect(() => calculateEcaFuelPortion(badPort, portOutside, testZones))
        .toThrow(/invalid coordinates/i);
    });

    it('throws when dest lon is NaN', () => {
      const badPort = { lat: 40, lon: NaN, locode: 'TEST' };
      expect(() => calculateEcaFuelPortion(portInsideNorthSea, badPort, testZones))
        .toThrow(/invalid coordinates/i);
    });

    it('throws when origin lat is Infinity', () => {
      const badPort = { lat: Infinity, lon: 5, locode: 'TEST' };
      expect(() => calculateEcaFuelPortion(badPort, portOutside, testZones))
        .toThrow(/invalid coordinates/i);
    });

    it('throws when dest coordinates are out of range', () => {
      const badPort = { lat: 91, lon: 5, locode: 'TEST' };
      expect(() => calculateEcaFuelPortion(portInsideNorthSea, badPort, testZones))
        .toThrow(/invalid coordinates/i);
    });
  });
});
