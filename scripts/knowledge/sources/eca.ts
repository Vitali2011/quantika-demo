#!/usr/bin/env tsx
/**
 * Load MARPOL Annex VI ECA zones from YAML into eca_zones table
 *
 * Usage:
 *   npx tsx scripts/knowledge/sources/eca.ts
 *
 * Source: data/knowledge/eca/marpol-annex-vi.yaml
 * Output: Updates eca_zones table with 4 ECA zones
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStore } from '@/lib/session-store';
import { parseMarpolEcaZones } from '@/lib/knowledge/eca/parser';

const YAML_PATH = join(process.cwd(), 'data/knowledge/eca/marpol-annex-vi.yaml');

function main() {
  console.log('[ECA] Loading MARPOL Annex VI zones...');

  const yamlContent = readFileSync(YAML_PATH, 'utf-8');
  const zones = parseMarpolEcaZones(yamlContent);

  console.log(`[ECA] Parsed ${zones.length} zones from YAML`);

  const store = getStore();
  const db = store.getDb();

  // Clear existing zones (for idempotent reload)
  db.prepare('DELETE FROM eca_zones').run();
  console.log('[ECA] Cleared existing zones');

  // Insert zones
  const insertStmt = db.prepare(`
    INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const zone of zones) {
    insertStmt.run(
      zone.name,
      zone.region,
      zone.polygon_geojson,
      zone.fuel_sulphur_max_pct,
      zone.effective_from,
      zone.effective_to
    );
    console.log(`[ECA]   Inserted: ${zone.name} (${zone.region})`);
  }

  console.log('[ECA] ✓ Done');
}

if (require.main === module) {
  main();
}
