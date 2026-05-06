#!/usr/bin/env ts-node
/**
 * validate-data-files.ts
 * Validates knowledge data files for schema correctness and coordinate ranges.
 * Run: npx ts-node scripts/knowledge/validate-data-files.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const DATA_DIR = path.resolve(__dirname, '../../data/knowledge');

// ── Waypoints ──────────────────────────────────────────────────────────────

function validateWaypoints(): void {
  const file = path.join(DATA_DIR, 'searoute-waypoints.yaml');
  console.log(`\nValidating ${file}...`);

  const raw = fs.readFileSync(file, 'utf-8');
  const data = yaml.load(raw) as Record<string, unknown>;

  if (data.version !== 'searoute-waypoints-v1') {
    throw new Error(`Invalid version: ${data.version}`);
  }

  const waypoints = data.waypoints as Array<Record<string, unknown>>;
  if (!Array.isArray(waypoints) || waypoints.length < 10) {
    throw new Error(`Expected ≥10 waypoints, got ${waypoints?.length ?? 0}`);
  }

  const VALID_CHOKE_TYPES = new Set(['canal', 'strait', 'rounding']);
  const ids = new Set<string>();

  for (const wp of waypoints) {
    const id = wp.id as string;
    if (!id) throw new Error(`Waypoint missing id: ${JSON.stringify(wp)}`);
    if (ids.has(id)) throw new Error(`Duplicate waypoint id: ${id}`);
    ids.add(id);

    const lat = wp.lat as number;
    const lon = wp.lon as number;
    if (typeof lat !== 'number' || lat < -90 || lat > 90) {
      throw new Error(`${id}: invalid lat ${lat}`);
    }
    if (typeof lon !== 'number' || lon < -180 || lon > 180) {
      throw new Error(`${id}: invalid lon ${lon}`);
    }

    if (!VALID_CHOKE_TYPES.has(wp.choke_type as string)) {
      throw new Error(`${id}: invalid choke_type "${wp.choke_type}"`);
    }

    if (wp.choke_type === 'canal' && !wp.linked_to) {
      throw new Error(`${id}: canal waypoint must have linked_to`);
    }
  }

  // Verify linked pairs are symmetric
  const waypointMap = new Map(waypoints.map((wp) => [wp.id as string, wp]));
  for (const wp of waypoints) {
    if (wp.linked_to) {
      const partner = waypointMap.get(wp.linked_to as string);
      if (!partner) {
        throw new Error(`${wp.id}: linked_to "${wp.linked_to}" not found`);
      }
      if (partner.linked_to !== wp.id) {
        throw new Error(
          `${wp.id}: linked_to "${wp.linked_to}" does not link back`,
        );
      }
    }
  }

  console.log(`  ✓ ${waypoints.length} waypoints valid`);
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  let hasError = false;

  try {
    validateWaypoints();
  } catch (err) {
    console.error(`  ✗ searoute-waypoints: ${(err as Error).message}`);
    hasError = true;
  }

  if (hasError) {
    console.error('\nValidation FAILED');
    process.exit(1);
  } else {
    console.log('\nAll data files valid ✓');
  }
}

main();
