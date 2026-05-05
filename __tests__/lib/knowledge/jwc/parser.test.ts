import { parseJwcYaml } from '@/lib/knowledge/jwc/parser';

describe('JWC parser', () => {
  const validYaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
source_url: https://www.lmalloyds.com/lma/jointwar
zones:
  - zone_id: red-sea
    name: Red Sea (south of 18°N)
    region: red-sea
    transit_rate_pct: 0.75
    hold_rate_pct: 0.50
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[32.5,12.5],[44.0,12.5],[44.0,18.0],[32.5,18.0],[32.5,12.5]]]}
    notes: 'Houthi threat — escalated 2024-Q4'
  - zone_id: black-sea
    name: Black Sea
    region: black-sea
    transit_rate_pct: 1.0
    hold_rate_pct: 0.75
    port_list: ILSKENDERUN,TRCERESAN,UAODESA
    notes: 'Russia-Ukraine conflict'
`;

  describe('valid inputs', () => {
    it('parses valid YAML with polygon_geojson', () => {
      const result = parseJwcYaml(validYaml);
      expect(result.version).toBe('JWC-2025-Q1');
      expect(result.effective_from).toBe('2025-01-15');
      expect(result.zones).toHaveLength(2);
      expect(result.zones[0].zone_id).toBe('red-sea');
      expect(result.zones[0].transit_rate_pct).toBe(0.75);
      expect(result.zones[0].polygon_geojson).toContain('Polygon');
    });

    it('parses zone with port_list', () => {
      const result = parseJwcYaml(validYaml);
      expect(result.zones[1].port_list).toBe('ILSKENDERUN,TRCERESAN,UAODESA');
    });

    it('accepts zone with both polygon and port_list', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: combo
    name: Combo Zone
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: 0.3
    polygon_geojson: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}'
    port_list: USNYC
`;
      const result = parseJwcYaml(yaml);
      expect(result.zones[0].polygon_geojson).toBeTruthy();
      expect(result.zones[0].port_list).toBe('USNYC');
    });

    it('accepts empty zones array', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones: []
`;
      const result = parseJwcYaml(yaml);
      expect(result.zones).toEqual([]);
    });

    it('accepts high but plausible rate (2.5%)', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: high-rate
    name: High Rate Zone
    region: test
    transit_rate_pct: 2.5
    hold_rate_pct: 2.0
    polygon_geojson: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}'
`;
      const result = parseJwcYaml(yaml);
      expect(result.zones[0].transit_rate_pct).toBe(2.5);
    });
  });

  describe('empty/falsy inputs', () => {
    it('throws on empty string', () => {
      expect(() => parseJwcYaml('')).toThrow('YAML content cannot be empty');
    });

    it('throws on whitespace-only string', () => {
      expect(() => parseJwcYaml('   \n  ')).toThrow('YAML content cannot be empty');
    });
  });

  describe('malformed YAML', () => {
    it('throws on invalid YAML syntax', () => {
      expect(() => parseJwcYaml('invalid: [unclosed')).toThrow();
    });
  });

  describe('missing required fields', () => {
    it('throws when zones key is missing', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
`;
      expect(() => parseJwcYaml(yaml)).toThrow();
    });

    it('throws when zone_id is missing', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - name: No ID Zone
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: 0.3
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow();
    });

    it('throws when transit_rate_pct is missing', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: test
    name: Test
    region: test
    hold_rate_pct: 0.3
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow();
    });
  });

  describe('zone geometry validation', () => {
    it('throws when zone has neither polygon nor port_list', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: no-geo
    name: No Geometry
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: 0.3
`;
      expect(() => parseJwcYaml(yaml)).toThrow('must have polygon_geojson or port_list');
    });
  });

  describe('rate bounds validation', () => {
    it('throws when transit_rate_pct is negative', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: negative
    name: Negative Rate
    region: test
    transit_rate_pct: -0.5
    hold_rate_pct: 0.3
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow('transit_rate_pct must be between 0 and 10');
    });

    it('throws when transit_rate_pct > 10', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: too-high
    name: Too High Rate
    region: test
    transit_rate_pct: 200
    hold_rate_pct: 0.3
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow('transit_rate_pct must be between 0 and 10');
    });

    it('throws when hold_rate_pct is negative', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: negative
    name: Negative Hold
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: -0.3
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow('hold_rate_pct must be between 0 and 10');
    });

    it('throws when hold_rate_pct > 10', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: too-high
    name: Too High Hold
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: 150
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow('hold_rate_pct must be between 0 and 10');
    });
  });

  describe('duplicate zone_id validation', () => {
    it('throws when duplicate zone_id exists', () => {
      const yaml = `
version: JWC-2025-Q1
effective_from: '2025-01-15'
zones:
  - zone_id: duplicate
    name: First
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: 0.3
    polygon_geojson: '{}'
  - zone_id: duplicate
    name: Second
    region: test
    transit_rate_pct: 0.7
    hold_rate_pct: 0.4
    polygon_geojson: '{}'
`;
      expect(() => parseJwcYaml(yaml)).toThrow('Duplicate zone_id');
    });
  });

  describe('version validation', () => {
    it('logs warning when version is "unknown"', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const yaml = `
version: unknown
effective_from: '2025-01-15'
zones:
  - zone_id: test
    name: Test
    region: test
    transit_rate_pct: 0.5
    hold_rate_pct: 0.3
    polygon_geojson: '{}'
`;
      parseJwcYaml(yaml);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWC version is "unknown"')
      );
      consoleWarnSpy.mockRestore();
    });
  });
});
