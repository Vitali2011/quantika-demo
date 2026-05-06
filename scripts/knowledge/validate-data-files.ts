/**
 * validate-data-files.ts
 *
 * Append-only validators for knowledge data files. Each spec adds its own
 * validateXxx function — no modifications to existing functions.
 *
 * Usage:
 *   npx tsx scripts/knowledge/validate-data-files.ts ports
 *   npx tsx scripts/knowledge/validate-data-files.ts jwc
 *   npx tsx scripts/knowledge/validate-data-files.ts panama
 *   npx tsx scripts/knowledge/validate-data-files.ts waypoints
 *   npx tsx scripts/knowledge/validate-data-files.ts all
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

// ── Shared types ──────────────────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

function parseYaml(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

// ── spec-01: top-200-ports.json ───────────────────────────────────────────────

const PortSchema = z.object({
  locode: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}$/, 'LOCODE must match [A-Z]{2}[A-Z0-9]{3}'),
  name: z.string().min(1),
  country: z.string().length(2),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  rank: z.number().int().min(1).max(200),
  category: z.enum(['container', 'bulk', 'tanker', 'mixed']),
});
export type Port = z.infer<typeof PortSchema>;
const PortsArraySchema = z.array(PortSchema);

const REGION_COUNTRIES: Record<string, string[]> = {
  asia: ['CN','HK','KR','JP','TW','VN','TH','MY','ID','PH','AU','NZ','BD','MM','LK','IN','PK','SG','PG','FJ'],
  mena: ['AE','SA','OM','KW','BH','QA','EG','IL','TR','IR','IQ','LB','JO','YE','DJ'],
  europe: ['NL','DE','BE','ES','IT','PL','RU','FI','SE','DK','NO','EE','GR','GB','FR','LT','UA','GE','PT','IE'],
  americas: ['US','PA','MX','BR','CL','AR','UY','PE','CO','VE','TT','JM','CA','PR','DO','GT','SV','HN','NI','CR'],
  africa: ['ZA','TZ','KE','NG','GH','CI','SN','MA','DZ','TN','AO','LY','ET','MZ'],
};

export function checkRegionalDistribution(data: Port[]): Record<string, number> {
  const counts: Record<string, number> = { asia: 0, mena: 0, europe: 0, americas: 0, africa: 0, other: 0 };
  for (const port of data) {
    let found = false;
    for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
      if (countries.includes(port.country)) {
        counts[region]++;
        found = true;
        break;
      }
    }
    if (!found) counts.other++;
  }
  return counts;
}

export function validateTopPorts(json: unknown): { valid: boolean; errors: string[]; data?: Port[] } {
  const result = PortsArraySchema.safeParse(json);
  if (!result.success) {
    return { valid: false, errors: result.error.errors.map((e) => `[${e.path.join('.')}] ${e.message}`) };
  }
  const data = result.data;
  const errors: string[] = [];
  if (data.length !== 200) errors.push(`Expected 200 ports, got ${data.length}`);
  const locodes = data.map((p) => p.locode);
  if (new Set(locodes).size !== locodes.length) {
    const dupes = locodes.filter((l, i) => locodes.indexOf(l) !== i);
    errors.push(`Duplicate LOCODEs: ${[...new Set(dupes)].join(', ')}`);
  }
  const ranks = data.map((p) => p.rank).sort((a, b) => a - b);
  const expected = Array.from({ length: 200 }, (_, i) => i + 1);
  const missing = expected.filter((r) => !ranks.includes(r));
  if (missing.length > 0) errors.push(`Missing ranks: ${missing.join(', ')}`);
  return errors.length === 0 ? { valid: true, errors: [], data } : { valid: false, errors };
}

function runPorts(): ValidationResult {
  const fp = path.resolve(process.cwd(), 'data/knowledge/top-200-ports.json');
  const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  const result = validateTopPorts(raw);
  if (!result.valid) return { valid: false, errors: result.errors };
  const dist = checkRegionalDistribution(result.data!);
  const targets: Record<string, number> = { asia: 70, mena: 40, europe: 40, americas: 30, africa: 20 };
  const tolerance = 3;
  const errs: string[] = [];
  for (const [region, count] of Object.entries(dist)) {
    if (region === 'other') {
      if (count > 0) errs.push(`${count} ports unclassified by region`);
      continue;
    }
    if (Math.abs(count - targets[region]) > tolerance) {
      errs.push(`${region}: ${count} (target ${targets[region]} ±${tolerance})`);
    }
  }
  if (errs.length > 0) return { valid: false, errors: errs };
  console.log(`  Distribution: ${JSON.stringify(dist)}`);
  return { valid: true, errors: [] };
}

// ── spec-02: JWC 2025-current.yaml ────────────────────────────────────────────

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

export function validateJwcCurrent(
  filePath: string = path.resolve(process.cwd(), 'data/knowledge/jwc/2025-current.yaml'),
): ValidationResult {
  const errors: string[] = [];
  if (!fs.existsSync(filePath)) return { valid: false, errors: [`File not found: ${filePath}`] };
  let raw: unknown;
  try { raw = parseYaml(filePath); } catch (e) { return { valid: false, errors: [`YAML parse error: ${String(e)}`] }; }
  const result = JwcBulletinSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) errors.push(`Schema: ${issue.path.join('.')} — ${issue.message}`);
    return { valid: false, errors };
  }
  const bulletin = result.data;
  if (new Date(bulletin.effective_from) < new Date('2025-10-01')) {
    errors.push(`effective_from ${bulletin.effective_from} is older than 2025-10-01`);
  }
  for (const zone of bulletin.zones) {
    let geo: unknown;
    try { geo = JSON.parse(zone.polygon_geojson); } catch { errors.push(`Zone ${zone.zone_id}: polygon_geojson not valid JSON`); continue; }
    const gr = GeoJsonPolygonSchema.safeParse(geo);
    if (!gr.success) { errors.push(`Zone ${zone.zone_id}: invalid GeoJSON Polygon`); continue; }
    const ring = gr.data.coordinates[0];
    if (ring.length < 8) errors.push(`Zone ${zone.zone_id}: outer ring has ${ring.length} points (need ≥8)`);
    if (!isClosedRing(ring)) errors.push(`Zone ${zone.zone_id}: outer ring not closed`);
  }
  const ids = bulletin.zones.map((z) => z.zone_id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) errors.push(`Duplicate zone_ids: ${dupes.join(', ')}`);
  return { valid: errors.length === 0, errors };
}

// ── spec-04: Panama tariffs 2026-current.yaml ─────────────────────────────────

export function validatePanamaTariffs2026(
  filePath: string = path.resolve(process.cwd(), 'data/knowledge/panama/tariffs-2026-current.yaml'),
): ValidationResult {
  const errors: string[] = [];
  if (!fs.existsSync(filePath)) return { valid: false, errors: [`File not found: ${filePath}`] };
  let data: Record<string, unknown>;
  try { data = parseYaml(filePath) as Record<string, unknown>; } catch (e) { return { valid: false, errors: [`YAML parse error: ${e}`] }; }
  for (const f of ['version', 'effective_from', 'source_url', 'fetched_at', 'tariffs']) {
    if (!data[f]) errors.push(`Missing required field: ${f}`);
  }
  const tariffs = data.tariffs as Array<Record<string, unknown>>;
  if (!Array.isArray(tariffs) || tariffs.length < 6) {
    errors.push(`Expected ≥6 vessel types, got ${Array.isArray(tariffs) ? tariffs.length : 0}`);
  } else {
    for (const t of tariffs) {
      if (!t.confidence) errors.push(`Missing confidence on vessel_type: ${t.vessel_type}`);
      if (t.vessel_type !== 'passenger') {
        if (typeof t.base_fee_usd !== 'number' || (t.base_fee_usd as number) <= 0) {
          errors.push(`base_fee_usd must be > 0 for: ${t.vessel_type}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── spec-05: searoute-waypoints.yaml ──────────────────────────────────────────

export function validateWaypoints(
  filePath: string = path.resolve(process.cwd(), 'data/knowledge/searoute-waypoints.yaml'),
): ValidationResult {
  const errors: string[] = [];
  if (!fs.existsSync(filePath)) return { valid: false, errors: [`File not found: ${filePath}`] };
  let data: Record<string, unknown>;
  try { data = parseYaml(filePath) as Record<string, unknown>; } catch (e) { return { valid: false, errors: [`YAML parse error: ${e}`] }; }
  if (data.version !== 'searoute-waypoints-v1') errors.push(`Invalid version: ${data.version}`);
  const waypoints = data.waypoints as Array<Record<string, unknown>>;
  if (!Array.isArray(waypoints) || waypoints.length < 10) {
    return { valid: false, errors: [`Expected ≥10 waypoints, got ${waypoints?.length ?? 0}`] };
  }
  const VALID_CHOKE = new Set(['canal', 'strait', 'rounding']);
  const ids = new Set<string>();
  for (const wp of waypoints) {
    const id = wp.id as string;
    if (!id) { errors.push(`Waypoint missing id`); continue; }
    if (ids.has(id)) errors.push(`Duplicate waypoint id: ${id}`);
    ids.add(id);
    const lat = wp.lat as number, lon = wp.lon as number;
    if (typeof lat !== 'number' || lat < -90 || lat > 90) errors.push(`${id}: invalid lat ${lat}`);
    if (typeof lon !== 'number' || lon < -180 || lon > 180) errors.push(`${id}: invalid lon ${lon}`);
    if (!VALID_CHOKE.has(wp.choke_type as string)) errors.push(`${id}: invalid choke_type "${wp.choke_type}"`);
    if (wp.choke_type === 'canal' && !wp.linked_to) errors.push(`${id}: canal waypoint must have linked_to`);
  }
  const wpMap = new Map(waypoints.map((wp) => [wp.id as string, wp]));
  for (const wp of waypoints) {
    if (wp.linked_to) {
      const partner = wpMap.get(wp.linked_to as string);
      if (!partner) errors.push(`${wp.id}: linked_to "${wp.linked_to}" not found`);
      else if (partner.linked_to !== wp.id) errors.push(`${wp.id}: linked_to "${wp.linked_to}" does not link back`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── CLI runner ────────────────────────────────────────────────────────────────

const isCLI = require.main === module;

function report(name: string, r: ValidationResult): boolean {
  if (r.valid) { console.log(`✓ ${name}`); return true; }
  console.error(`✗ ${name}`);
  for (const e of r.errors) console.error(`  - ${e}`);
  return false;
}

if (isCLI) {
  const cmd = process.argv[2] ?? 'all';
  const checks: Array<[string, () => ValidationResult]> = [];
  if (cmd === 'ports' || cmd === 'all') checks.push(['top-200-ports.json', runPorts]);
  if (cmd === 'jwc' || cmd === 'all') checks.push(['jwc/2025-current.yaml', validateJwcCurrent]);
  if (cmd === 'panama' || cmd === 'all') checks.push(['panama/tariffs-2026-current.yaml', validatePanamaTariffs2026]);
  if (cmd === 'waypoints' || cmd === 'all') checks.push(['searoute-waypoints.yaml', validateWaypoints]);

  if (checks.length === 0) {
    console.log('Usage: npx tsx scripts/knowledge/validate-data-files.ts {ports|jwc|panama|waypoints|all}');
    process.exit(2);
  }

  let allOk = true;
  for (const [name, fn] of checks) {
    if (!report(name, fn())) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}
