/**
 * validate-data-files.ts
 * Append-only validators for knowledge data files.
 * Each spec adds its own validateXxx function — no modifications to existing functions.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { z } from 'zod';

// ── Shared helpers ────────────────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

function parseYaml(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.parse(content);
}

function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

// ── spec-02: JWC 2025-current ─────────────────────────────────────────────────

const GeoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

const JwcZoneSchema = z.object({
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
  zones: z.array(JwcZoneSchema).min(6),
});

/**
 * Validate data/knowledge/jwc/2025-current.yaml
 * Added by spec-02-jwc-current.
 */
export function validateJwcCurrent(
  filePath: string = path.resolve(process.cwd(), 'data/knowledge/jwc/2025-current.yaml'),
): ValidationResult {
  const errors: string[] = [];

  // 1. File exists
  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`] };
  }

  // 2. YAML parses
  let raw: unknown;
  try {
    raw = parseYaml(filePath);
  } catch (e) {
    return { valid: false, errors: [`YAML parse error: ${String(e)}`] };
  }

  // 3. Schema validation
  const result = JwcBulletinSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`Schema: ${issue.path.join('.')} — ${issue.message}`);
    }
    return { valid: false, errors };
  }

  const bulletin = result.data;

  // 4. effective_from >= 2025-10-01
  const effectiveDate = new Date(bulletin.effective_from);
  const minDate = new Date('2025-10-01');
  if (effectiveDate < minDate) {
    errors.push(`effective_from ${bulletin.effective_from} is older than 2025-10-01`);
  }

  // 5. Polygon geometry checks
  for (const zone of bulletin.zones) {
    let geojson: unknown;
    try {
      geojson = JSON.parse(zone.polygon_geojson);
    } catch (e) {
      errors.push(`Zone ${zone.zone_id}: polygon_geojson is not valid JSON`);
      continue;
    }

    const geoResult = GeoJsonPolygonSchema.safeParse(geojson);
    if (!geoResult.success) {
      errors.push(`Zone ${zone.zone_id}: invalid GeoJSON Polygon`);
      continue;
    }

    const outerRing = geoResult.data.coordinates[0];
    if (outerRing.length < 8) {
      errors.push(
        `Zone ${zone.zone_id}: outer ring has only ${outerRing.length} points (need ≥8)`,
      );
    }
    if (!isClosedRing(outerRing)) {
      errors.push(`Zone ${zone.zone_id}: polygon outer ring is not closed`);
    }
  }

  // 6. Zone ID uniqueness
  const ids = bulletin.zones.map((z) => z.zone_id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    errors.push(`Duplicate zone_ids: ${dupes.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── CLI runner ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const result = validateJwcCurrent();
  if (result.valid) {
    console.log('✓ JWC 2025-current.yaml is valid');
    process.exit(0);
  } else {
    console.error('✗ JWC 2025-current.yaml validation failed:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}
