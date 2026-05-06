import yaml from 'yaml';

export interface EcaZone {
  name: string;
  region: string;
  polygon_geojson: string;
  fuel_sulphur_max_pct: number;
  effective_from: string;
  effective_to: string | null;
}

interface YamlPolygon {
  type: string;
  coordinates?: unknown;
}

interface YamlZone {
  name?: string;
  region?: string;
  fuel_sulphur_max_pct?: number;
  effective_from?: string;
  effective_to?: string | null;
  polygon?: YamlPolygon;
}

interface YamlRoot {
  zones?: YamlZone[];
}

/**
 * Parse MARPOL Annex VI ECA zones from YAML content
 *
 * Input contract:
 * - yamlContent must be non-empty string
 * - All zones must have: name, region, fuel_sulphur_max_pct, effective_from, polygon
 * - fuel_sulphur_max_pct must be in [0, 1] range and finite
 * - polygon must have coordinates array
 */
export function parseMarpolEcaZones(yamlContent: string): EcaZone[] {
  // Guard: empty/falsy input
  if (!yamlContent || yamlContent.trim() === '') {
    throw new Error('YAML content cannot be empty');
  }

  let parsed: YamlRoot;
  try {
    parsed = yaml.parse(yamlContent);
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed.zones || !Array.isArray(parsed.zones)) {
    throw new Error('YAML must contain a "zones" array');
  }

  const result: EcaZone[] = [];

  for (const [idx, zone] of parsed.zones.entries()) {
    // Validate required fields
    if (!zone.name || typeof zone.name !== 'string') {
      throw new Error(`Zone at index ${idx}: missing required field "name"`);
    }
    if (!zone.region || typeof zone.region !== 'string') {
      throw new Error(`Zone at index ${idx}: missing required field "region"`);
    }
    if (zone.fuel_sulphur_max_pct === undefined || zone.fuel_sulphur_max_pct === null) {
      throw new Error(`Zone "${zone.name}": missing required field "fuel_sulphur_max_pct"`);
    }
    if (!zone.effective_from || typeof zone.effective_from !== 'string') {
      throw new Error(`Zone "${zone.name}": missing required field "effective_from"`);
    }
    if (!zone.polygon) {
      throw new Error(`Zone "${zone.name}": missing required field "polygon"`);
    }

    // Validate fuel_sulphur_max_pct
    const fuelPct = zone.fuel_sulphur_max_pct;
    if (!Number.isFinite(fuelPct)) {
      throw new Error(`Zone "${zone.name}": invalid fuel_sulphur_max_pct (must be a finite number)`);
    }
    if (fuelPct < 0 || fuelPct > 1) {
      throw new Error(`Zone "${zone.name}": fuel_sulphur_max_pct must be between 0 and 1 (got ${fuelPct})`);
    }

    // Validate polygon
    if (!zone.polygon.coordinates || (Array.isArray(zone.polygon.coordinates) && zone.polygon.coordinates.length === 0)) {
      throw new Error(`Zone "${zone.name}": polygon has empty or missing coordinates`);
    }

    // Convert polygon to GeoJSON string
    const polygonGeoJson = JSON.stringify({
      type: zone.polygon.type,
      coordinates: zone.polygon.coordinates,
    });

    result.push({
      name: zone.name,
      region: zone.region,
      polygon_geojson: polygonGeoJson,
      fuel_sulphur_max_pct: fuelPct,
      effective_from: zone.effective_from,
      effective_to: zone.effective_to === undefined ? null : zone.effective_to,
    });
  }

  return result;
}
