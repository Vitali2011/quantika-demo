/**
 * Adversarial QA for lib/knowledge/eca/parser.ts
 *
 * Cold-start independent review — focus: polygon_geojson string path (PR #338 fix).
 * Uses test.failing() to document bugs without breaking the suite.
 *
 * BUG-1 (Medium): coordinates non-array passes silently
 *   Line 97 in parser.ts: the guard only fires for null/undefined or empty array.
 *   Non-array truthy values (object `{}`, number `42`, string `"foo"`) bypass
 *   the check and produce an EcaZone with corrupt polygon_geojson. The DB insert
 *   succeeds; isPortInEca then silently skips the zone (adapter line 36: checks
 *   `polygon.coordinates.length > 0` which is undefined for {}) → false negative
 *   in ECA detection for the affected zone.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseMarpolEcaZones } from '@/lib/knowledge/eca/parser';
import { isPortInEca, calculateEcaFuelPortion } from '@/lib/knowledge/eca/adapter';
import type { EcaZone } from '@/lib/knowledge/eca/parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zoneYaml(overrides: {
  name?: string;
  region?: string;
  fuel?: number;
  from?: string;
  polygon_geojson?: string;
  polygon?: string;
}): string {
  const {
    name = 'Test ECA',
    region = 'test',
    fuel = 0.10,
    from = '2015-01-01',
    polygon_geojson,
    polygon,
  } = overrides;

  const polygonLine = polygon_geojson !== undefined
    ? `    polygon_geojson: |\n      ${polygon_geojson}`
    : polygon !== undefined
    ? `    polygon:\n${polygon}`
    : '';

  return `zones:
  - name: "${name}"
    region: "${region}"
    fuel_sulphur_max_pct: ${fuel}
    effective_from: "${from}"
${polygonLine}
`;
}

// ---------------------------------------------------------------------------
// Group 1: polygon_geojson path — invalid JSON
// ---------------------------------------------------------------------------

describe('parser adversarial — polygon_geojson invalid JSON', () => {
  it('throws on whitespace-only polygon_geojson (quoted YAML string, truthy but not JSON)', () => {
    // Note: block literal `|` with whitespace-only content → YAML parses as ""
    // Use quoted string to ensure the parser receives a non-empty whitespace string.
    const yaml = `zones:
  - name: "Test ECA"
    region: "test"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon_geojson: "   "
`;
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/polygon_geojson is not valid JSON/i);
  });

  it('throws on arbitrary non-JSON string in polygon_geojson', () => {
    const yaml = zoneYaml({ polygon_geojson: 'not-json-at-all' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/polygon_geojson is not valid JSON/i);
  });

  it('throws on truncated JSON in polygon_geojson', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":[[' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/polygon_geojson is not valid JSON/i);
  });
});

// ---------------------------------------------------------------------------
// Group 2: polygon_geojson path — missing / empty coordinates
// ---------------------------------------------------------------------------

describe('parser adversarial — polygon_geojson missing or empty coordinates', () => {
  it('throws when polygon_geojson has no coordinates key', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon"}' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/empty or missing coordinates/i);
  });

  it('throws when polygon_geojson has coordinates: null', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":null}' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/empty or missing coordinates/i);
  });

  it('throws when polygon_geojson has coordinates: [] (empty outer ring)', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":[]}' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/empty or missing coordinates/i);
  });
});

// ---------------------------------------------------------------------------
// Group 3: BUG-1 — coordinates is non-array truthy value
//
// These tests encode the CORRECT expected behavior (parser should reject).
// They are marked test.failing() because the current impl silently accepts
// non-array coordinates — a confirmed bug.
// ---------------------------------------------------------------------------

describe('parser adversarial — BUG-1: non-array coordinates silently accepted', () => {
  // BUG-1a: coordinates is an object {}
  it('BUG-1a: throws when polygon_geojson has coordinates: {} (object not array)', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":{}}' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/coordinates/i);
  });

  // BUG-1b: coordinates is a number
  it('BUG-1b: throws when polygon_geojson has coordinates: 42 (number not array)', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":42}' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/coordinates/i);
  });

  // BUG-1c: coordinates is a string "bad"
  it('BUG-1c: throws when polygon_geojson has coordinates: "bad" (string not array)', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":"bad"}' });
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/coordinates/i);
  });

  // BUG-1d: after fix — parser now throws at parse time, preventing silent adapter failure
  it('BUG-1d (fixed): zone with coordinates:{} throws at parse time (silent adapter failure prevented)', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":{}}' });
    // Fixed: Array.isArray guard now rejects non-array coordinates immediately
    expect(() => parseMarpolEcaZones(yaml)).toThrow(/coordinates/i);
  });
});

// ---------------------------------------------------------------------------
// Group 4: polygon_geojson — edge case: empty inner ring [[]]
// ---------------------------------------------------------------------------

describe('parser adversarial — polygon_geojson edge cases', () => {
  // coordinates: [[]] — outer array has 1 element (empty inner ring).
  // Array.isArray([[]]]) = true, [[]]].length = 1 (not 0) → no throw.
  // Accepted. Adapter: ring = [], pointInPolygon with empty ring → always false.
  it('accepts polygon_geojson with empty inner ring [[]] (no throw, but zone is functionally useless)', () => {
    const yaml = zoneYaml({ polygon_geojson: '{"type":"Polygon","coordinates":[[]]}' });
    // Current behavior: no throw (questionable but not a blocking bug)
    const zones = parseMarpolEcaZones(yaml);
    expect(zones).toHaveLength(1);
    // Adapter: silently returns false for any port (ring is empty)
    const port = { lat: 50, lon: 5 };
    expect(isPortInEca(port, zones)).toBe(false);
  });

  it('accepts polygon_geojson with out-of-range coordinates (no range validation)', () => {
    // Coordinates with lon=200 (invalid GeoJSON) pass through parser unchecked.
    const yaml = zoneYaml({
      polygon_geojson: '{"type":"Polygon","coordinates":[[[200,200],[210,200],[210,210],[200,210],[200,200]]]}',
    });
    // Parser does NOT validate coordinate ranges — this documents the gap.
    expect(() => parseMarpolEcaZones(yaml)).not.toThrow();
    const zones = parseMarpolEcaZones(yaml);
    expect(zones).toHaveLength(1);
  });

  it('accepts polygon_geojson with wrong type field (no type validation)', () => {
    // type: "Point" is accepted by parser (no type check).
    // Adapter skips it silently (checks type === 'Polygon').
    const yaml = zoneYaml({
      polygon_geojson: '{"type":"MultiPolygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
    });
    expect(() => parseMarpolEcaZones(yaml)).not.toThrow();
    const zones = parseMarpolEcaZones(yaml);
    // Adapter: type !== 'Polygon' → skips zone → false for any port
    const port = { lat: 0.5, lon: 0.5 };
    expect(isPortInEca(port, zones)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 5: Both polygon AND polygon_geojson present
// ---------------------------------------------------------------------------

describe('parser adversarial — both polygon and polygon_geojson present', () => {
  it('polygon_geojson wins over polygon when both are present', () => {
    // Encode both keys. polygon_geojson should take precedence (line 89).
    const yaml = `zones:
  - name: "Dual Format Zone"
    region: "test"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[0,50],[10,50],[10,60],[0,60],[0,50]]]}
    polygon:
      type: "Polygon"
      coordinates:
        - [[100, 10], [110, 10], [110, 20], [100, 10]]
`;
    const zones = parseMarpolEcaZones(yaml);
    expect(zones).toHaveLength(1);
    const parsed = JSON.parse(zones[0].polygon_geojson);
    // polygon_geojson wins — first coordinate should be [0, 50] not [100, 10]
    expect(parsed.coordinates[0][0]).toEqual([0, 50]);
  });
});

// ---------------------------------------------------------------------------
// Group 6: Duplicate zone names
// ---------------------------------------------------------------------------

describe('parser adversarial — duplicate zone names', () => {
  it('parser returns both zones when duplicate names present (no dedup at parse level)', () => {
    const yaml = `zones:
  - name: "North Sea ECA"
    region: "north-sea"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[0,55],[10,55],[10,60],[0,60],[0,55]]]}
  - name: "North Sea ECA"
    region: "north-sea-dupe"
    fuel_sulphur_max_pct: 0.10
    effective_from: "2015-01-01"
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[0,55],[10,55],[10,60],[0,60],[0,55]]]}
`;
    const zones = parseMarpolEcaZones(yaml);
    // Parser returns both — DB unique constraint will catch this at seed time
    expect(zones).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Group 7: Giant GeoJSON (no crash test)
// ---------------------------------------------------------------------------

describe('parser adversarial — giant polygon_geojson', () => {
  it('handles a polygon_geojson with 1000 coordinate pairs without crashing', () => {
    // Generate a large ring (closed polygon around lon=0..1 zigzag)
    const coords: [number, number][] = Array.from({ length: 999 }, (_, i) => [
      i % 2 === 0 ? 0 : 1,
      50 + (i / 999) * 10,
    ]);
    coords.push(coords[0]); // close ring
    const json = JSON.stringify({ type: 'Polygon', coordinates: [coords] });
    const yaml = zoneYaml({ polygon_geojson: json });
    expect(() => parseMarpolEcaZones(yaml)).not.toThrow();
    const zones = parseMarpolEcaZones(yaml);
    expect(zones).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Group 8: End-to-end with real YAML file — verify audit claims
// ---------------------------------------------------------------------------

describe('parser adversarial — end-to-end with real marpol-annex-vi.yaml', () => {
  const yamlPath = path.join(process.cwd(), 'data/knowledge/eca/marpol-annex-vi.yaml');

  it('real YAML parses to exactly 4 zones (audit claim: eca_zones 0→4)', () => {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const zones = parseMarpolEcaZones(raw);
    expect(zones).toHaveLength(4);
  });

  it('all 4 zones have valid polygon_geojson (Polygon type, non-empty coordinates)', () => {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const zones = parseMarpolEcaZones(raw);
    for (const zone of zones) {
      const poly = JSON.parse(zone.polygon_geojson);
      expect(poly.type).toBe('Polygon');
      expect(Array.isArray(poly.coordinates)).toBe(true);
      expect(poly.coordinates.length).toBeGreaterThan(0);
      expect(poly.coordinates[0].length).toBeGreaterThan(0);
    }
  });

  it('audit claim: calculateEcaFuelPortion is NOT 0% for a Baltic Sea port (refutes silent 0% bug)', () => {
    // The audit doc says: "calculateEcaFuelPortion() returns 0.0 when zones.length === 0"
    // and the fix should give 4 zones so port in Baltic Sea returns 0.05, not 0.
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const zones = parseMarpolEcaZones(raw);
    expect(zones.length).toBeGreaterThan(0);

    // Stockholm is clearly inside Baltic Sea ECA
    // Baltic polygon covers roughly lon=9..30, lat=54..66
    const stockholm = { lat: 59.3, lon: 18.1 };
    const portOutside = { lat: 1.3, lon: 103.8 }; // Singapore — outside all ECAs

    const portion = calculateEcaFuelPortion(stockholm, portOutside, zones);
    expect(portion).toBe(0.05); // NOT 0.0
  });

  it('calculateEcaFuelPortion returns 0.0 for two ports both outside all ECAs', () => {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const zones = parseMarpolEcaZones(raw);

    const singapore = { lat: 1.3, lon: 103.8 };
    const dubai = { lat: 25.2, lon: 55.3 };

    const portion = calculateEcaFuelPortion(singapore, dubai, zones);
    expect(portion).toBe(0.0);
  });

  it('all 4 zones have expected zone names from audit', () => {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const zones = parseMarpolEcaZones(raw);
    const names = zones.map((z) => z.name);
    expect(names).toContain('North Sea Emission Control Area');
    expect(names).toContain('Baltic Sea Emission Control Area');
    expect(names).toContain('North American Emission Control Area');
    expect(names).toContain('Mediterranean Sea Emission Control Area for SOx and PM');
  });

  it('all 4 zones have fuel_sulphur_max_pct = 0.10', () => {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const zones = parseMarpolEcaZones(raw);
    for (const zone of zones) {
      expect(zone.fuel_sulphur_max_pct).toBe(0.10);
    }
  });
});
