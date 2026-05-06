import * as fs from 'fs';
import * as path from 'path';
import { parse as yamlParse } from 'yaml';

interface EcaZone {
  zone_id: string;
  name: string;
  region: string;
  fuel_sulphur_max_pct: number;
  effective_from: string;
  resolution: string;
  polygon_geojson: string;
}

interface EcaFile {
  regulation: string;
  source_url: string;
  fetched_at: string;
  zones: EcaZone[];
}

function loadEcaFile(): EcaFile {
  const filePath = path.join(process.cwd(), 'data/knowledge/eca/marpol-annex-vi.yaml');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return yamlParse(raw) as EcaFile;
}

interface GeoJsonPolygon {
  type: string;
  coordinates: number[][][];
}

function parsePolygon(geojson: string): GeoJsonPolygon {
  return JSON.parse(geojson) as GeoJsonPolygon;
}

function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function isValidLatLon(coord: number[]): boolean {
  return coord[0] >= -180 && coord[0] <= 180 && coord[1] >= -90 && coord[1] <= 90;
}

describe('MARPOL Annex VI ECA data file', () => {
  let data: EcaFile;

  beforeAll(() => {
    data = loadEcaFile();
  });

  test('top-level schema fields present', () => {
    expect(data.regulation).toBe('MARPOL Annex VI');
    expect(data.source_url).toMatch(/^https?:\/\//);
    expect(data.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(data.zones)).toBe(true);
  });

  test('exactly 4 zones present', () => {
    expect(data.zones).toHaveLength(4);
  });

  const expectedZoneIds = ['north-sea', 'baltic-sea', 'north-america', 'mediterranean'];

  test.each(expectedZoneIds)('zone %s is present', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId);
    expect(zone).toBeDefined();
  });

  test.each(expectedZoneIds)('zone %s has fuel_sulphur_max_pct = 0.10', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId)!;
    expect(zone.fuel_sulphur_max_pct).toBe(0.10);
  });

  test.each(expectedZoneIds)('zone %s has required schema fields', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId)!;
    expect(typeof zone.name).toBe('string');
    expect(zone.name.length).toBeGreaterThan(0);
    expect(typeof zone.region).toBe('string');
    expect(typeof zone.effective_from).toBe('string');
    expect(zone.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof zone.resolution).toBe('string');
    expect(zone.resolution).toMatch(/^MEPC\.\d+\(\d+\)$/);
    expect(typeof zone.polygon_geojson).toBe('string');
  });

  test('Mediterranean NECA effective_from is 2025-05-01', () => {
    const med = data.zones.find((z) => z.zone_id === 'mediterranean')!;
    expect(med.effective_from).toBe('2025-05-01');
  });

  test('Mediterranean NECA resolution is MEPC.361(79)', () => {
    const med = data.zones.find((z) => z.zone_id === 'mediterranean')!;
    expect(med.resolution).toBe('MEPC.361(79)');
  });

  test('North Sea effective_from is 2007-11-22', () => {
    const zone = data.zones.find((z) => z.zone_id === 'north-sea')!;
    expect(zone.effective_from).toBe('2007-11-22');
  });

  test('Baltic Sea effective_from is 2006-08-19', () => {
    const zone = data.zones.find((z) => z.zone_id === 'baltic-sea')!;
    expect(zone.effective_from).toBe('2006-08-19');
  });

  test('North America ECA effective_from is 2012-08-01', () => {
    const zone = data.zones.find((z) => z.zone_id === 'north-america')!;
    expect(zone.effective_from).toBe('2012-08-01');
  });

  test.each(expectedZoneIds)('zone %s polygon_geojson is valid JSON', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId)!;
    expect(() => parsePolygon(zone.polygon_geojson)).not.toThrow();
  });

  test.each(expectedZoneIds)('zone %s polygon is type Polygon', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId)!;
    const poly = parsePolygon(zone.polygon_geojson);
    expect(poly.type).toBe('Polygon');
  });

  test.each(expectedZoneIds)('zone %s polygon ring is closed', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId)!;
    const poly = parsePolygon(zone.polygon_geojson);
    const ring = poly.coordinates[0];
    expect(isClosedRing(ring)).toBe(true);
  });

  test.each(expectedZoneIds)('zone %s polygon coordinates are valid lat/lon', (zoneId) => {
    const zone = data.zones.find((z) => z.zone_id === zoneId)!;
    const poly = parsePolygon(zone.polygon_geojson);
    const ring = poly.coordinates[0];
    for (const coord of ring) {
      expect(isValidLatLon(coord)).toBe(true);
    }
  });
});
