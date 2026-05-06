import type Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { parseJwcYaml, type JwcZone, type JwcBulletin } from './parser';
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from '../governance';

/**
 * Refreshes JWC war risk zones from YAML file.
 *
 * Input contract:
 * - db: required (TypeScript guard)
 * - yamlPath: optional, defaults to data/knowledge/jwc/2025-Q1.yaml
 * - nonexistent path → throws (fs.readFileSync)
 * - malformed YAML → parseJwcYaml throws, reportSyncFailure called
 * - empty YAML → parseJwcYaml throws
 * - duplicate zone_id → parseJwcYaml throws
 * - parser validates: NaN/Infinity, negative rates, out-of-range
 * - idempotent: same YAML twice → 0 rowsChanged on second run
 *
 * @param db Database instance
 * @param yamlPath Optional path to YAML file
 * @returns Object with rowsChanged and yamlVersion
 */
export async function refreshJwc(
  db: Database.Database,
  yamlPath?: string
): Promise<{ rowsChanged: number; yamlVersion: string }> {
  const syncId = reportSyncStarted(db, 'jwc');

  try {
    const defaultPath = 'data/knowledge/jwc/2025-Q1.yaml';
    const path = yamlPath || defaultPath;

    // Read YAML file
    const yamlContent = readFileSync(path, 'utf-8');

    // Parse YAML (validation happens here)
    const bulletin = parseJwcYaml(yamlContent);

    // Upsert zones
    const result = upsertJwcZones(db, bulletin);

    const rowsChanged = result.added + result.updated + result.removed;

    reportSyncSuccess(db, syncId, {
      rowsChanged,
      upstreamVersion: bulletin.version,
      metadata: result,
    });

    return {
      rowsChanged,
      yamlVersion: bulletin.version,
    };
  } catch (err) {
    reportSyncFailure(db, syncId, err as Error);
    throw err;
  }
}

/**
 * Upserts JWC zones using diff/delete logic in a single transaction.
 *
 * Input contract:
 * - Empty zones array: removes all existing zones
 * - Duplicate zone_id: parser already validates this
 * - Missing required fields: parser already validates this
 * - NaN/Infinity rates: parser already validates with Number.isFinite
 * - Negative rates: parser already validates with >= 0 check
 * - Out of range rates: parser already validates with <= 10 check
 *
 * @param db Database instance
 * @param bulletin Parsed bulletin from JWC YAML
 * @returns Object with added, updated, removed counts
 */
function upsertJwcZones(
  db: Database.Database,
  bulletin: JwcBulletin
): {
  added: number;
  updated: number;
  removed: number;
} {
  const zones = bulletin.zones;
  const upstreamZoneIds = new Set(zones.map((z) => z.zone_id));
  const existingZoneIds = new Set<string>(
    (db.prepare('SELECT zone_id FROM war_risk_zones').all() as any[]).map(
      (r) => r.zone_id
    )
  );

  const toAdd = zones.filter((z) => !existingZoneIds.has(z.zone_id));
  const toRemove = Array.from(existingZoneIds).filter((id) => !upstreamZoneIds.has(id));

  // For updates, we need to check if the data actually changed
  const toUpdate = zones.filter((z) => {
    if (!existingZoneIds.has(z.zone_id)) return false;

    const existing = db.prepare(`
      SELECT name, region, polygon_geojson, port_list, transit_rate_pct, hold_rate_pct,
             jwc_version, effective_from, source_url, notes
      FROM war_risk_zones
      WHERE zone_id = ?
    `).get(z.zone_id) as any;

    return (
      existing.name !== z.name ||
      existing.region !== z.region ||
      (existing.polygon_geojson || null) !== (z.polygon_geojson || null) ||
      (existing.port_list || null) !== (z.port_list || null) ||
      existing.transit_rate_pct !== z.transit_rate_pct ||
      existing.hold_rate_pct !== z.hold_rate_pct ||
      (existing.jwc_version || null) !== bulletin.version ||
      (existing.effective_from || null) !== bulletin.effective_from ||
      (existing.source_url || null) !== (bulletin.source_url || null) ||
      (existing.notes || null) !== (z.notes || null)
    );
  });

  const tx = db.transaction(() => {
    // Delete removed zones
    for (const zoneId of toRemove) {
      db.prepare('DELETE FROM war_risk_zones WHERE zone_id = ?').run(zoneId);
    }

    // Insert new zones
    const insertStmt = db.prepare(`
      INSERT INTO war_risk_zones (
        zone_id, name, region, polygon_geojson, port_list,
        transit_rate_pct, hold_rate_pct, jwc_version, effective_from,
        source_url, notes
      ) VALUES (
        @zone_id, @name, @region, @polygon_geojson, @port_list,
        @transit_rate_pct, @hold_rate_pct, @jwc_version, @effective_from,
        @source_url, @notes
      )
    `);

    for (const zone of toAdd) {
      insertStmt.run({
        zone_id: zone.zone_id,
        name: zone.name,
        region: zone.region,
        polygon_geojson: zone.polygon_geojson || null,
        port_list: zone.port_list || null,
        transit_rate_pct: zone.transit_rate_pct,
        hold_rate_pct: zone.hold_rate_pct,
        jwc_version: bulletin.version,
        effective_from: bulletin.effective_from,
        source_url: bulletin.source_url || null,
        notes: zone.notes || null,
      });
    }

    // Update changed zones
    const updateStmt = db.prepare(`
      UPDATE war_risk_zones
      SET name = @name,
          region = @region,
          polygon_geojson = @polygon_geojson,
          port_list = @port_list,
          transit_rate_pct = @transit_rate_pct,
          hold_rate_pct = @hold_rate_pct,
          jwc_version = @jwc_version,
          effective_from = @effective_from,
          source_url = @source_url,
          notes = @notes
      WHERE zone_id = @zone_id
    `);

    for (const zone of toUpdate) {
      updateStmt.run({
        zone_id: zone.zone_id,
        name: zone.name,
        region: zone.region,
        polygon_geojson: zone.polygon_geojson || null,
        port_list: zone.port_list || null,
        transit_rate_pct: zone.transit_rate_pct,
        hold_rate_pct: zone.hold_rate_pct,
        jwc_version: bulletin.version,
        effective_from: bulletin.effective_from,
        source_url: bulletin.source_url || null,
        notes: zone.notes || null,
      });
    }
  });

  tx();

  return {
    added: toAdd.length,
    updated: toUpdate.length,
    removed: toRemove.length,
  };
}
