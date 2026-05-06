import { parseMarpolEcaZones } from '@/lib/knowledge/eca/parser';

describe('ECA parser', () => {
  describe('parseMarpolEcaZones', () => {
    it('parses valid YAML with 4 ECA zones', () => {
      const yaml = `
zones:
  - name: "North Sea ECA"
    region: "north-sea"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    effective_to: null
    polygon:
      type: "Polygon"
      coordinates:
        - [[5.0, 62.0], [-4.0, 62.0], [-4.0, 57.5], [5.0, 62.0]]
  - name: "Baltic Sea ECA"
    region: "baltic"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    effective_to: null
    polygon:
      type: "Polygon"
      coordinates:
        - [[9.0, 57.4], [10.9, 55.8], [9.0, 57.4]]
`;
      const zones = parseMarpolEcaZones(yaml);
      expect(zones).toHaveLength(2);
      expect(zones[0].name).toBe('North Sea ECA');
      expect(zones[0].region).toBe('north-sea');
      expect(zones[0].fuel_sulphur_max_pct).toBe(0.10);
      expect(zones[0].effective_from).toBe('2015-01-01');
      expect(zones[0].effective_to).toBeNull();
      expect(zones[0].polygon_geojson).toBeTruthy();
      const parsed = JSON.parse(zones[0].polygon_geojson);
      expect(parsed.type).toBe('Polygon');
      expect(parsed.coordinates).toBeTruthy();
    });

    it('throws on empty string input', () => {
      expect(() => parseMarpolEcaZones('')).toThrow(/cannot be empty/i);
    });

    it('throws on null input', () => {
      expect(() => parseMarpolEcaZones(null as any)).toThrow(/cannot be empty/i);
    });

    it('throws on undefined input', () => {
      expect(() => parseMarpolEcaZones(undefined as any)).toThrow(/cannot be empty/i);
    });

    it('throws on malformed YAML', () => {
      const badYaml = `
zones:
  - name: "Test"
    invalid: [unclosed bracket
`;
      expect(() => parseMarpolEcaZones(badYaml)).toThrow();
    });

    it('throws when zone missing required name field', () => {
      const yaml = `
zones:
  - region: "north-sea"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon:
      type: "Polygon"
      coordinates: [[[]]]
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/missing required field.*name/i);
    });

    it('throws when zone missing region field', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon:
      type: "Polygon"
      coordinates: [[[]]]
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/missing required field.*region/i);
    });

    it('throws when fuel_sulphur_max_pct is NaN', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: NaN
    effective_from: "2015-01-01"
    polygon:
      type: "Polygon"
      coordinates: [[[]]]
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/invalid fuel_sulphur_max_pct/i);
    });

    it('throws when fuel_sulphur_max_pct is negative', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: -0.5
    effective_from: "2015-01-01"
    polygon:
      type: "Polygon"
      coordinates: [[[]]]
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/fuel_sulphur_max_pct must be between 0 and 1/i);
    });

    it('throws when fuel_sulphur_max_pct > 1', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: 1.5
    effective_from: "2015-01-01"
    polygon:
      type: "Polygon"
      coordinates: [[[]]]
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/fuel_sulphur_max_pct must be between 0 and 1/i);
    });

    it('throws when polygon is missing', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/missing.*polygon/i);
    });

    it('throws when polygon has no coordinates', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon:
      type: "Polygon"
`;
      expect(() => parseMarpolEcaZones(yaml)).toThrow(/polygon.*empty.*coordinates/i);
    });

    it('accepts null effective_to', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    effective_to: null
    polygon:
      type: "Polygon"
      coordinates:
        - [[5.0, 62.0], [6.0, 62.0], [5.0, 62.0]]
`;
      const zones = parseMarpolEcaZones(yaml);
      expect(zones[0].effective_to).toBeNull();
    });

    it('accepts string effective_to date', () => {
      const yaml = `
zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    effective_to: "2030-12-31"
    polygon:
      type: "Polygon"
      coordinates:
        - [[5.0, 62.0], [6.0, 62.0], [5.0, 62.0]]
`;
      const zones = parseMarpolEcaZones(yaml);
      expect(zones[0].effective_to).toBe('2030-12-31');
    });
  });
});
