import yaml from 'yaml';
import { z } from 'zod';

/**
 * JWC Zone schema with strict validation
 *
 * Input contract:
 * - zone_id: required, non-empty string
 * - name: required, non-empty string
 * - region: required, non-empty string
 * - transit_rate_pct: required, finite number in [0, 10] (sanity bound to catch typos)
 * - hold_rate_pct: required, finite number in [0, 10] (sanity bound to catch typos)
 * - polygon_geojson OR port_list: at least one must be present
 * - jwc_version: required, non-empty string (warning if "unknown")
 * - effective_from: required, non-empty string
 * - source_url: optional string
 * - notes: optional string
 */
const JwcZoneSchema = z.object({
  zone_id: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1),
  transit_rate_pct: z
    .number()
    .refine((val) => Number.isFinite(val), { message: 'transit_rate_pct must be a finite number' })
    .refine((val) => val >= 0 && val <= 10, { message: 'transit_rate_pct must be between 0 and 10' }),
  hold_rate_pct: z
    .number()
    .refine((val) => Number.isFinite(val), { message: 'hold_rate_pct must be a finite number' })
    .refine((val) => val >= 0 && val <= 10, { message: 'hold_rate_pct must be between 0 and 10' }),
  polygon_geojson: z.string().optional(),
  port_list: z.string().optional(),
  notes: z.string().optional(),
});

const JwcBulletinSchema = z.object({
  version: z.string().min(1),
  effective_from: z.string().min(1),
  source_url: z.string().optional(),
  zones: z.array(JwcZoneSchema),
});

export type JwcZone = z.infer<typeof JwcZoneSchema>;
export type JwcBulletin = z.infer<typeof JwcBulletinSchema>;

/**
 * Parse JWC bulletin YAML content
 *
 * Input contract:
 * - yamlContent must be non-empty string (no whitespace-only)
 * - YAML must be syntactically valid
 * - Must contain 'zones' array (can be empty)
 * - Each zone must have zone_id, name, region, transit_rate_pct, hold_rate_pct
 * - Each zone must have polygon_geojson OR port_list (at least one)
 * - Rates must be finite numbers in [0, 10] range
 * - No duplicate zone_id values
 * - Logs warning if version is "unknown"
 *
 * @throws Error if input validation fails
 * @throws Error if YAML parsing fails
 * @throws Error if zod validation fails
 * @throws Error if duplicate zone_id found
 * @throws Error if zone has neither polygon nor port_list
 */
export function parseJwcYaml(yamlContent: string): JwcBulletin {
  // Guard: empty/falsy input
  if (!yamlContent || yamlContent.trim() === '') {
    throw new Error('YAML content cannot be empty');
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.parse(yamlContent);
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate with zod
  const result = JwcBulletinSchema.parse(parsed);

  // Check for duplicate zone_id
  const zoneIds = new Set<string>();
  for (const zone of result.zones) {
    if (zoneIds.has(zone.zone_id)) {
      throw new Error(`Duplicate zone_id: "${zone.zone_id}"`);
    }
    zoneIds.add(zone.zone_id);
  }

  // Validate that each zone has polygon or port_list
  for (const zone of result.zones) {
    if (!zone.polygon_geojson && !zone.port_list) {
      throw new Error(`Zone "${zone.zone_id}" must have polygon_geojson or port_list`);
    }
  }

  // Warn if version is "unknown"
  if (result.version === 'unknown') {
    console.warn('JWC version is "unknown" - please update with actual bulletin version');
  }

  return result;
}
