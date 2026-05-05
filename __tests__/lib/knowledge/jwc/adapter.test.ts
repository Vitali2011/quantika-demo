/**
 * Tests for lib/knowledge/jwc/adapter.ts
 *
 * Input contract:
 * - refreshJwc(db, yamlPath?):
 *   - db: required (TypeScript guard)
 *   - yamlPath: optional, defaults to data/knowledge/jwc/2025-Q1.yaml
 *   - nonexistent path → throws
 *   - malformed YAML → parseJwcYaml throws, reportSyncFailure called
 *   - empty YAML → parseJwcYaml throws
 * - upsertJwcZones(db, zones):
 *   - empty zones array → deletes all, returns {added:0, updated:0, removed:N}
 *   - parser already validates: no NaN, no negatives, no out-of-range, no duplicates
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { refreshJwc } from '@/lib/knowledge/jwc/adapter';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration016 from '@/lib/migrations/016-war-risk-zones';
import { registerSource } from '@/lib/knowledge/governance';

describe('refreshJwc', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    migration016.up(db);

    // Register JWC source for governance tracking
    registerSource(db, {
      slug: 'jwc',
      name: 'JWC Listed Areas (war risk)',
      kind: 'mixed',
      category: 'regulatory',
      source_url: 'https://www.lmalloyds.com/lma/jointwar',
      license: 'LMA Public Bulletin',
      refresh_mode: 'manual',
      stale_threshold_days: 100,
      refresh_command: 'npm run knowledge:refresh jwc',
      primary_table: 'war_risk_zones',
      vector_table: 'jwc_vec',
    });
  });

  afterEach(() => {
    db.close();
  });

  it('throws when YAML file does not exist', async () => {
    await expect(async () => {
      await refreshJwc(db, '/nonexistent/file.yaml');
    }).rejects.toThrow();
  });

  it('throws when YAML content is empty', async () => {
    const emptyYaml = '';
    const tmpPath = '/tmp/empty.yaml';
    require('fs').writeFileSync(tmpPath, emptyYaml);

    await expect(async () => {
      await refreshJwc(db, tmpPath);
    }).rejects.toThrow('YAML content cannot be empty');
  });

  it('successfully upserts zones from valid YAML', async () => {
    const yamlPath = join(process.cwd(), 'data/knowledge/jwc/2025-Q1.yaml');

    const result = await refreshJwc(db, yamlPath);

    expect(result.rowsChanged).toBeGreaterThan(0);
    expect(result.yamlVersion).toBe('JWC-2025-Q1');

    // Verify zones were inserted
    const count = db.prepare('SELECT COUNT(*) as count FROM war_risk_zones').get() as { count: number };
    expect(count.count).toBe(4); // 4 zones in 2025-Q1.yaml
  });

  it('second refresh with same YAML returns 0 rowsChanged', async () => {
    const yamlPath = join(process.cwd(), 'data/knowledge/jwc/2025-Q1.yaml');

    await refreshJwc(db, yamlPath);
    const result2 = await refreshJwc(db, yamlPath);

    expect(result2.rowsChanged).toBe(0);
  });

  it('removes zone when it is deleted from YAML', async () => {
    const yamlPath = join(process.cwd(), 'data/knowledge/jwc/2025-Q1.yaml');

    // First refresh with all zones
    await refreshJwc(db, yamlPath);

    // Create modified YAML with one zone removed
    const originalYaml = readFileSync(yamlPath, 'utf-8');
    const modifiedYaml = `version: JWC-2025-Q1-modified
effective_from: '2025-01-15'
source_url: https://www.lmalloyds.com/lma/jointwar
zones:
  - zone_id: red-sea
    name: Red Sea (south of 18°N)
    region: red-sea
    transit_rate_pct: 0.75
    hold_rate_pct: 0.50
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[32.5,12.5],[44.0,12.5],[44.0,18.0],[32.5,18.0],[32.5,12.5]]]}
`;

    const tmpPath = '/tmp/modified.yaml';
    require('fs').writeFileSync(tmpPath, modifiedYaml);

    const result = await refreshJwc(db, tmpPath);

    // 3 zones removed + 1 zone updated (version changed from JWC-2025-Q1 to JWC-2025-Q1-modified)
    expect(result.rowsChanged).toBe(4);

    const count = db.prepare('SELECT COUNT(*) as count FROM war_risk_zones').get() as { count: number };
    expect(count.count).toBe(1); // Only red-sea remains
  });

  it('updates zone when rate changes in YAML', async () => {
    const yamlPath = join(process.cwd(), 'data/knowledge/jwc/2025-Q1.yaml');

    await refreshJwc(db, yamlPath);

    // Modify YAML with updated rate
    const modifiedYaml = `version: JWC-2025-Q1-updated
effective_from: '2025-01-15'
source_url: https://www.lmalloyds.com/lma/jointwar
zones:
  - zone_id: red-sea
    name: Red Sea (south of 18°N)
    region: red-sea
    transit_rate_pct: 1.25
    hold_rate_pct: 0.50
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[32.5,12.5],[44.0,12.5],[44.0,18.0],[32.5,18.0],[32.5,12.5]]]}
  - zone_id: black-sea
    name: Black Sea
    region: black-sea
    transit_rate_pct: 1.00
    hold_rate_pct: 0.75
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[27.5,40.0],[42.0,40.0],[42.0,47.0],[27.5,47.0],[27.5,40.0]]]}
    port_list: UAODESA,UAILLICHIVSK,UAYUZHNY,RUMCONST,BGBURGAS,TRSAMSUN
  - zone_id: gulf-of-guinea
    name: Gulf of Guinea (piracy risk)
    region: gulf-of-guinea
    transit_rate_pct: 0.30
    hold_rate_pct: 0.20
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[-10.0,-5.0],[10.0,-5.0],[10.0,10.0],[-10.0,10.0],[-10.0,-5.0]]]}
  - zone_id: persian-gulf
    name: Persian Gulf / Strait of Hormuz
    region: persian-gulf
    transit_rate_pct: 0.15
    hold_rate_pct: 0.10
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[48.0,24.0],[60.0,24.0],[60.0,30.5],[48.0,30.5],[48.0,24.0]]]}
    port_list: AEJEBEL,AEKHALIFAH,KWSHUAIBA,SASAUDIPORTS,IQBASRA
`;

    const tmpPath = '/tmp/updated.yaml';
    require('fs').writeFileSync(tmpPath, modifiedYaml);

    const result = await refreshJwc(db, tmpPath);

    // All 4 zones updated: 1 for rate change, 4 for version change (JWC-2025-Q1 → JWC-2025-Q1-updated)
    expect(result.rowsChanged).toBe(4);

    // Verify the rate was updated
    const redSea = db.prepare('SELECT transit_rate_pct FROM war_risk_zones WHERE zone_id = ?').get('red-sea') as any;
    expect(redSea.transit_rate_pct).toBe(1.25);
  });

  it('reports sync to governance tables', async () => {
    const yamlPath = join(process.cwd(), 'data/knowledge/jwc/2025-Q1.yaml');

    await refreshJwc(db, yamlPath);

    // Check sync log
    const syncLog = db.prepare('SELECT * FROM knowledge_sync_log WHERE source_slug = ? ORDER BY id DESC LIMIT 1').get('jwc') as any;
    expect(syncLog).toBeDefined();
    expect(syncLog.status).toBe('success');
    expect(syncLog.rows_changed).toBeGreaterThan(0);

    // Check source status
    const source = db.prepare('SELECT * FROM knowledge_sources WHERE slug = ?').get('jwc') as any;
    expect(source).toBeDefined();
    expect(source.status).toBe('fresh');
    expect(source.consecutive_failures).toBe(0);
  });

  it('reports failure when parser throws', async () => {
    const malformedYaml = 'version: invalid\nzones: not an array';
    const tmpPath = '/tmp/malformed.yaml';
    require('fs').writeFileSync(tmpPath, malformedYaml);

    await expect(async () => {
      await refreshJwc(db, tmpPath);
    }).rejects.toThrow();

    // Verify failure was logged
    const syncLog = db.prepare('SELECT * FROM knowledge_sync_log WHERE source_slug = ? ORDER BY id DESC LIMIT 1').get('jwc') as any;
    expect(syncLog).toBeDefined();
    expect(syncLog.status).toBe('failure');
    expect(syncLog.error_message).toBeDefined();
  });
});
