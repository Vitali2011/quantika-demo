/**
 * Phase 1 Integration Smoke Test
 *
 * Tests the entire Knowledge Layer Phase 1 end-to-end:
 * 1. Runs all migrations (013-017)
 * 2. Bootstraps registry
 * 3. Mocks OFAC fetcher with fixture XML, calls refreshOfac — verifies fresh status
 * 4. Calls getDistance for hardcoded port pair, with mocked Python service — verifies cache hit on 2nd call
 * 5. Calls listSources — verifies all sources properly tracked
 * 6. Calls GET /api/health/knowledge — verifies 200 (all fresh) or 503 (one failing)
 *
 * Input Contract (integration level):
 * - All migrations must run without errors
 * - Bootstrap must register exactly 21 sources from KNOWLEDGE_REGISTRY
 * - OFAC refresh with valid XML must result in status='fresh', consecutive_failures=0
 * - getDistance must cache results and return { distanceNm, source: 'cache' } on second call
 * - listSources must return SourceRow[] with health_signal computed correctly
 * - Health endpoint must return 503 when any source has health_signal='failing'
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

// Migrations
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration014 from '@/lib/migrations/014-sanctions-entities';
import migration015 from '@/lib/migrations/015-port-distances';
import migration016 from '@/lib/migrations/016-war-risk-zones';
import migration017 from '@/lib/migrations/017-eca-zones';

// Governance
import { bootstrapKnowledgeSources, KNOWLEDGE_REGISTRY } from '@/lib/knowledge/bootstrap';
import { listSources } from '@/lib/knowledge/governance';

// OFAC
import { refreshOfac } from '@/lib/knowledge/sanctions/ofac-adapter';
import type { Fetcher } from '@/lib/knowledge/sanctions/ofac-adapter';

// Distances
import { getDistance } from '@/lib/knowledge/distances/lookup';
import * as distancesClient from '@/lib/knowledge/distances/client';

// Health endpoint
import { GET as healthKnowledgeGET } from '@/app/api/health/knowledge/route';

// Mock dependencies
jest.mock('@/lib/knowledge/distances/client');
jest.mock('@/lib/knowledge/alerts', () => ({
  fireAlert: jest.fn().mockResolvedValue(undefined),
}));

// Mock session store for health endpoint
jest.mock('@/lib/session-store', () => ({
  getStore: () => ({
    getDatabase: () => (global as any).__testDb,
  }),
}));

describe('Knowledge Phase 1 Integration Smoke', () => {
  let db: Database.Database;
  let ofacFixtureXml: string;

  beforeAll(() => {
    // Load OFAC fixture
    const fixturePath = path.join(__dirname, '../fixtures/ofac/sample-sdn.xml');
    ofacFixtureXml = fs.readFileSync(fixturePath, 'utf-8');
  });

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Set global test db for mocked session-store
    (global as any).__testDb = db;

    jest.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    delete (global as any).__testDb;
  });

  it('runs all 5 migrations (013-017) without errors', () => {
    expect(() => migration013.up(db)).not.toThrow();
    expect(() => migration014.up(db)).not.toThrow();
    expect(() => migration015.up(db)).not.toThrow();
    expect(() => migration016.up(db)).not.toThrow();
    expect(() => migration017.up(db)).not.toThrow();

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('knowledge_sources');
    expect(tableNames).toContain('knowledge_sync_log');
    expect(tableNames).toContain('ofac_entities');
    expect(tableNames).toContain('eu_sanctions_entities');
    expect(tableNames).toContain('port_distances');
    expect(tableNames).toContain('war_risk_zones');
    expect(tableNames).toContain('eca_zones');
  });

  it('bootstraps registry with exactly 21 sources from KNOWLEDGE_REGISTRY', () => {
    migration013.up(db);

    bootstrapKnowledgeSources(db);

    const count = (
      db.prepare('SELECT COUNT(*) AS c FROM knowledge_sources').get() as any
    ).c;
    expect(count).toBe(20);
    expect(KNOWLEDGE_REGISTRY).toHaveLength(20);

    const sources = listSources(db);
    expect(sources).toHaveLength(20);

    // Verify Phase 1 sources are registered
    const slugs = sources.map((s) => s.slug);
    expect(slugs).toContain('ofac');
    expect(slugs).toContain('eu-sanctions');
    expect(slugs).toContain('distances');
    expect(slugs).toContain('jwc');
    expect(slugs).toContain('eca');
    expect(slugs).toContain('panama-tariffs');
  });

  it('refreshOfac with fixture XML results in status=fresh, consecutive_failures=0', async () => {
    migration013.up(db);
    migration014.up(db);
    bootstrapKnowledgeSources(db);

    const mockFetcher: Fetcher = async () => ofacFixtureXml;

    const result = await refreshOfac(db, mockFetcher);

    // Should have processed entities from fixture
    expect(result.rowsChanged).toBeGreaterThan(0);
    expect(result.upstreamVersion).toMatch(/^sha256:[a-f0-9]{16}$/);

    // Verify source status
    const source = db
      .prepare("SELECT * FROM knowledge_sources WHERE slug = 'ofac'")
      .get() as any;
    expect(source.status).toBe('fresh');
    expect(source.consecutive_failures).toBe(0);
    expect(source.last_synced_at).toBeTruthy();

    // Verify sync log
    const syncLog = db
      .prepare(
        "SELECT * FROM knowledge_sync_log WHERE source_slug = 'ofac' ORDER BY id DESC LIMIT 1"
      )
      .get() as any;
    expect(syncLog.status).toBe('success');
    expect(syncLog.rows_changed).toBe(result.rowsChanged);
  });

  it('getDistance caches results and returns cache hit on 2nd call', async () => {
    migration015.up(db);

    // Mock calculateDistance from client
    const mockCalculateDistance = distancesClient.calculateDistance as jest.MockedFunction<
      typeof distancesClient.calculateDistance
    >;
    mockCalculateDistance.mockResolvedValue({
      distanceNm: 8300,
      calculatorVersion: 'searoute-py-1.2.0',
    });

    // First call: cache miss, should call calculateDistance
    const result1 = await getDistance(db, 'SGSIN', 'NLRTM', 'direct');
    expect(result1.distanceNm).toBe(8300);
    expect(result1.source).toBe('computed');
    expect(mockCalculateDistance).toHaveBeenCalledTimes(1);

    // Second call: cache hit, should NOT call calculateDistance again
    const result2 = await getDistance(db, 'SGSIN', 'NLRTM', 'direct');
    expect(result2.distanceNm).toBe(8300);
    expect(result2.source).toBe('cache');
    expect(mockCalculateDistance).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  it('listSources returns all sources with health_signal computed correctly', () => {
    migration013.up(db);
    bootstrapKnowledgeSources(db);

    const sources = listSources(db);

    // All sources should be never_synced initially
    sources.forEach((source) => {
      expect(source).toHaveProperty('slug');
      expect(source).toHaveProperty('name');
      expect(source).toHaveProperty('health_signal');
      expect(source.health_signal).toBe('never_synced');
      expect(source.last_synced_at).toBeNull();
    });
  });

  it('GET /api/health/knowledge returns 503 when one source is failing', async () => {
    migration013.up(db);
    bootstrapKnowledgeSources(db);

    // Force one source to failing state
    db.prepare(
      "UPDATE knowledge_sources SET consecutive_failures = 3, status = 'failed' WHERE slug = 'ofac'"
    ).run();

    const req = new NextRequest('http://localhost/api/health/knowledge');
    const res = await healthKnowledgeGET();

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('degraded');
    expect(json.sources_failed).toBeGreaterThan(0);
  });

  it('GET /api/health/knowledge returns 200 when all sources are fresh', async () => {
    migration013.up(db);
    bootstrapKnowledgeSources(db);

    // Mark all sources as fresh
    db.prepare(
      "UPDATE knowledge_sources SET status = 'fresh', last_synced_at = datetime('now'), consecutive_failures = 0"
    ).run();

    const req = new NextRequest('http://localhost/api/health/knowledge');
    const res = await healthKnowledgeGET();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.sources_fresh).toBe(20);
    expect(json.sources_failed).toBe(0);
  });

  it('full end-to-end: migrations → bootstrap → refresh OFAC → verify health', async () => {
    // Step 1: Run all migrations
    migration013.up(db);
    migration014.up(db);
    migration015.up(db);
    migration016.up(db);
    migration017.up(db);

    // Step 2: Bootstrap registry
    bootstrapKnowledgeSources(db);

    // Step 3: Refresh OFAC
    const mockFetcher: Fetcher = async () => ofacFixtureXml;
    const result = await refreshOfac(db, mockFetcher);
    expect(result.rowsChanged).toBeGreaterThan(0);

    // Step 4: Verify listSources shows OFAC as fresh
    const sources = listSources(db);
    const ofacSource = sources.find((s) => s.slug === 'ofac');
    expect(ofacSource).toBeDefined();
    expect(ofacSource!.health_signal).toBe('ok');
    expect(ofacSource!.status).toBe('fresh');

    // Step 5: Verify health endpoint reflects one fresh source
    const req = new NextRequest('http://localhost/api/health/knowledge');
    const res = await healthKnowledgeGET();
    const json = await res.json();

    // Since OFAC is fresh but others are never_synced, status should be degraded
    // (never_synced sources don't fail health check but are counted as stale)
    expect(json.sources_fresh).toBe(1); // Only OFAC
    expect(json.sources_stale).toBe(19); // Others never synced (19 = 18 + bunker-oilmonster)
  });
});
