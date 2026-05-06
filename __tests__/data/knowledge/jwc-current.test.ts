import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { z } from 'zod';

const YAML_PATH = path.resolve(__dirname, '../../../data/knowledge/jwc/2025-current.yaml');

// ── Zod schema ────────────────────────────────────────────────────────────────

const GeoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .min(1),
});

const ZoneSchema = z.object({
  zone_id: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1),
  transit_rate_pct: z.number().nullable(),
  hold_rate_pct: z.number().nullable(),
  polygon_geojson: z.string().min(1),
  port_list: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low', 'needs-vitali-input']),
  notes: z.string().optional(),
});

const JwcBulletinSchema = z.object({
  version: z.string().min(1),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_url: z.string().url(),
  fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bulletin_ref: z.string().optional(),
  notes: z.string().optional(),
  zones: z.array(ZoneSchema).min(6),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePolygon(geojsonStr: string): { type: string; coordinates: number[][][] } {
  return JSON.parse(geojsonStr);
}

function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JWC 2025-current.yaml', () => {
  let raw: unknown;
  let bulletin: z.infer<typeof JwcBulletinSchema>;

  it('file exists and parses as valid YAML', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
    raw = yaml.parse(fs.readFileSync(YAML_PATH, 'utf8'));
    expect(raw).toBeDefined();
  });

  it('passes Zod schema validation', () => {
    const result = JwcBulletinSchema.safeParse(raw);
    if (!result.success) {
      console.error('Schema errors:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
    bulletin = result.data!;
  });

  it('has at least 6 zones', () => {
    expect(bulletin.zones.length).toBeGreaterThanOrEqual(6);
  });

  it('effective_from is >= 2025-10-01', () => {
    const effectiveDate = new Date(bulletin.effective_from);
    const minDate = new Date('2025-10-01');
    expect(effectiveDate.getTime()).toBeGreaterThanOrEqual(minDate.getTime());
  });

  it('every zone has a valid GeoJSON Polygon with ≥8 points (closed ring)', () => {
    for (const zone of bulletin.zones) {
      const geojson = parsePolygon(zone.polygon_geojson);

      // Validate GeoJSON shape via Zod
      const parsed = GeoJsonPolygonSchema.safeParse(geojson);
      if (!parsed.success) {
        console.error(`Zone ${zone.zone_id} invalid GeoJSON:`, parsed.error.issues);
      }
      expect(parsed.success).toBe(true);

      // Outer ring checks
      const outerRing = geojson.coordinates[0];
      expect(outerRing.length).toBeGreaterThanOrEqual(8);
      expect(isClosedRing(outerRing)).toBe(true);
    }
  });

  it('every zone has a confidence field', () => {
    for (const zone of bulletin.zones) {
      expect(zone.confidence).toBeDefined();
      expect(['high', 'medium', 'low', 'needs-vitali-input']).toContain(zone.confidence);
    }
  });

  it('zone IDs are unique', () => {
    const ids = bulletin.zones.map((z) => z.zone_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('numeric rates, when present, are in plausible range (0-15%)', () => {
    for (const zone of bulletin.zones) {
      if (zone.transit_rate_pct !== null) {
        expect(zone.transit_rate_pct).toBeGreaterThanOrEqual(0);
        expect(zone.transit_rate_pct).toBeLessThanOrEqual(15);
      }
      if (zone.hold_rate_pct !== null) {
        expect(zone.hold_rate_pct).toBeGreaterThanOrEqual(0);
        expect(zone.hold_rate_pct).toBeLessThanOrEqual(15);
      }
    }
  });

  it('red-sea zone is present', () => {
    const zone = bulletin.zones.find((z) => z.zone_id === 'red-sea');
    expect(zone).toBeDefined();
  });

  it('black-sea zone is present', () => {
    const zone = bulletin.zones.find((z) => z.zone_id === 'black-sea');
    expect(zone).toBeDefined();
  });

  it('gulf-of-guinea zone is present', () => {
    const zone = bulletin.zones.find((z) => z.zone_id === 'gulf-of-guinea');
    expect(zone).toBeDefined();
  });

  it('persian-gulf or related zone is present', () => {
    const zone = bulletin.zones.find(
      (z) =>
        z.zone_id.includes('persian-gulf') ||
        z.zone_id.includes('hormuz') ||
        z.region === 'persian-gulf',
    );
    expect(zone).toBeDefined();
  });
});
