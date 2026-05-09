/**
 * JWC YAML adapter — seeds jwc_vec + jwc_fts from local YAML file.
 *
 * Uses data/knowledge/jwc/2025-current.yaml (JWLA-033, 2026-03-12).
 * No live HTTP scraping required — YAML is the authoritative source
 * until a new bulletin is released.
 */

import path from 'path';
import fs from 'fs';
import { parse as parseYaml } from 'yaml';
import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from '@/lib/knowledge/governance';

const YAML_PATH = path.join(process.cwd(), 'data/knowledge/jwc/2025-current.yaml');

interface JwcZone {
  zone_id: string;
  name: string;
  region: string;
  transit_rate_pct: number | null;
  hold_rate_pct: number | null;
  port_list: string;
  confidence: string;
  notes: string;
}

interface JwcYaml {
  version: string;
  effective_from: string;
  bulletin_ref: string;
  fetched_at: string;
  notes: string;
  zones: JwcZone[];
}

export interface SyncJwcYamlOptions {
  dryRun?: boolean;
  db?: Database.Database;
  yamlPath?: string;
}

export interface SyncJwcYamlResult {
  zonesProcessed: number;
  chunksStored: number;
  bulletinRef: string;
}

function zoneToChunk(zone: JwcZone, meta: Pick<JwcYaml, 'bulletin_ref' | 'effective_from'>): Chunk {
  const transitLine = zone.transit_rate_pct != null
    ? `Transit war risk rate: ${zone.transit_rate_pct}% of hull value per voyage`
    : 'Transit war risk rate: not publicly available (negotiate with underwriter)';
  const holdLine = zone.hold_rate_pct != null
    ? `Hold (at-anchor) rate: ${zone.hold_rate_pct}% of hull value`
    : 'Hold rate: not publicly available';
  const ports = zone.port_list
    ? `Key ports: ${zone.port_list.split(',').map(p => p.trim()).join(', ')}`
    : '';

  const content = [
    `JWC War Risk Zone: ${zone.name}`,
    `Bulletin: ${meta.bulletin_ref} (effective ${meta.effective_from})`,
    `Region: ${zone.region}`,
    transitLine,
    holdLine,
    ports,
    zone.notes ? `Notes: ${zone.notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    content,
    metadata: {
      source: 'jwc',
      zone_id: zone.zone_id,
      region: zone.region,
      bulletin_ref: meta.bulletin_ref,
      effective_from: meta.effective_from,
      confidence: zone.confidence,
    },
  };
}

export async function syncJwcYaml(opts?: SyncJwcYamlOptions): Promise<SyncJwcYamlResult> {
  const { dryRun = false, db: providedDb, yamlPath = YAML_PATH } = opts ?? {};
  const db = providedDb ?? getDb();

  const syncLogId = reportSyncStarted(db, 'jwc');

  try {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const data: JwcYaml = parseYaml(raw);
    const zones: JwcZone[] = data.zones ?? [];

    const chunks = zones.map(zone =>
      zoneToChunk(zone, { bulletin_ref: data.bulletin_ref, effective_from: data.effective_from })
    );

    if (dryRun) {
      console.log(`[dryRun] JWC YAML sync: ${zones.length} zones → ${chunks.length} chunks (not stored)`);
      await reportSyncSuccess(db, syncLogId, { rowsChanged: 0, upstreamVersion: data.bulletin_ref });
      return { zonesProcessed: zones.length, chunksStored: chunks.length, bulletinRef: data.bulletin_ref };
    }

    await embedAndStore(chunks, {
      tableName: 'jwc_vec',
      ftsTable: 'jwc_fts',
      truncate: true,
      db,
    });

    await reportSyncSuccess(db, syncLogId, {
      rowsChanged: chunks.length,
      upstreamVersion: data.bulletin_ref,
    });

    return { zonesProcessed: zones.length, chunksStored: chunks.length, bulletinRef: data.bulletin_ref };
  } catch (error) {
    await reportSyncFailure(db, syncLogId, error as Error);
    throw error;
  }
}
