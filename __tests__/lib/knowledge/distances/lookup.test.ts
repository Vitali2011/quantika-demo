import Database from 'better-sqlite3';
import migration015 from '@/lib/migrations/015-port-distances';
import { getDistance } from '@/lib/knowledge/distances/lookup';
import * as distancesClient from '@/lib/knowledge/distances/client';

// Mock the calculateDistance function
jest.mock('@/lib/knowledge/distances/client');

describe('getDistance', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration015.up(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Input Contract — boundary cases', () => {
    it('throws Error for empty origin', async () => {
      await expect(getDistance(db, '', 'NLRTM', 'direct')).rejects.toThrow('Invalid LOCODE');
    });

    it('throws Error for null origin', async () => {
      await expect(getDistance(db, null as any, 'NLRTM', 'direct')).rejects.toThrow('Invalid LOCODE');
    });

    it('throws Error for undefined origin', async () => {
      await expect(getDistance(db, undefined as any, 'NLRTM', 'direct')).rejects.toThrow('Invalid LOCODE');
    });

    it('throws Error for empty dest', async () => {
      await expect(getDistance(db, 'SGSIN', '', 'direct')).rejects.toThrow('Invalid LOCODE');
    });

    it('throws Error for null dest', async () => {
      await expect(getDistance(db, 'SGSIN', null as any, 'direct')).rejects.toThrow('Invalid LOCODE');
    });

    it('throws Error for undefined dest', async () => {
      await expect(getDistance(db, 'SGSIN', undefined as any, 'direct')).rejects.toThrow('Invalid LOCODE');
    });

    it('throws Error for invalid LOCODE format (too short)', async () => {
      await expect(getDistance(db, 'SG', 'NLRTM', 'direct')).rejects.toThrow('Invalid LOCODE format');
    });

    it('throws Error for invalid LOCODE format (too long)', async () => {
      await expect(getDistance(db, 'SGSINGAPORE', 'NLRTM', 'direct')).rejects.toThrow('Invalid LOCODE format');
    });

    it('throws Error for invalid LOCODE format (wrong pattern)', async () => {
      await expect(getDistance(db, '12345', 'NLRTM', 'direct')).rejects.toThrow('Invalid LOCODE format');
    });

    it('defaults to "direct" when routeVia is undefined', async () => {
      // Insert cache entry for SGSIN → NLRTM direct
      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('SGSIN', 'NLRTM', 'direct', 8300);

      const result = await getDistance(db, 'SGSIN', 'NLRTM');
      expect(result.source).toBe('cache');
      expect(result.distanceNm).toBe(8300);
    });

    it('normalizes LOCODE to uppercase', async () => {
      // Insert cache entry for uppercase LOCODE
      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('SGSIN', 'NLRTM', 'direct', 8300);

      const result = await getDistance(db, 'sgsin', 'nlrtm', 'direct');
      expect(result.source).toBe('cache');
      expect(result.distanceNm).toBe(8300);
    });
  });

  describe('Cache hit', () => {
    it('returns cached distance when entry exists (cache hit)', async () => {
      // Insert known distance into cache
      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('SGSIN', 'NLRTM', 'direct', 8300);

      const result = await getDistance(db, 'SGSIN', 'NLRTM', 'direct');
      expect(result).toEqual({ distanceNm: 8300, source: 'cache' });
    });

    it('returns cached distance for symmetric pair (origin/dest swapped)', async () => {
      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('SGSIN', 'NLRTM', 'direct', 8300);

      const result = await getDistance(db, 'NLRTM', 'SGSIN', 'direct');
      expect(result).toEqual({ distanceNm: 8300, source: 'cache' });
    });

    it('distinguishes cache by routeVia (suez vs cape)', async () => {
      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('BRTER', 'CNQIN', 'suez', 11200);

      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('BRTER', 'CNQIN', 'cape', 14500);

      const viaSuez = await getDistance(db, 'BRTER', 'CNQIN', 'suez');
      const viaCape = await getDistance(db, 'BRTER', 'CNQIN', 'cape');

      expect(viaSuez.distanceNm).toBe(11200);
      expect(viaSuez.source).toBe('cache');
      expect(viaCape.distanceNm).toBe(14500);
      expect(viaCape.source).toBe('cache');
    });
  });

  describe('Cache miss — compute and store', () => {
    it('computes distance when cache miss, stores in DB, returns computed', async () => {
      // Mock calculateDistance to return a known value
      const mockCalculateDistance = distancesClient.calculateDistance as jest.MockedFunction<
        typeof distancesClient.calculateDistance
      >;
      mockCalculateDistance.mockResolvedValue({
        distanceNm: 8300,
        calculatorVersion: 'test-v1',
      });

      const result = await getDistance(db, 'SGSIN', 'NLRTM', 'direct');

      expect(result.source).toBe('computed');
      expect(result.distanceNm).toBeGreaterThan(0);
      expect(Number.isFinite(result.distanceNm)).toBe(true);

      // Verify DB insertion
      const cached = db.prepare(`
        SELECT distance_nm FROM port_distances
        WHERE (origin = ? AND dest = ? OR origin = ? AND dest = ?)
        AND route_via = ?
      `).get('SGSIN', 'NLRTM', 'NLRTM', 'SGSIN', 'direct') as { distance_nm: number } | undefined;

      expect(cached).toBeDefined();
      expect(cached!.distance_nm).toBe(result.distanceNm);
    });

    it('throws Error when LOCODE cannot be resolved to coordinates', async () => {
      // Mock calculateDistance (won't be called but needed for jest setup)
      const mockCalculateDistance = distancesClient.calculateDistance as jest.MockedFunction<
        typeof distancesClient.calculateDistance
      >;
      mockCalculateDistance.mockResolvedValue({
        distanceNm: 0,
        calculatorVersion: 'test-v1',
      });

      // Invalid LOCODE that passes format check but doesn't exist
      await expect(getDistance(db, 'XXXXX', 'NLRTM', 'direct')).rejects.toThrow('Cannot resolve LOCODE');
    });

    it('throws Error when searoute service fails', async () => {
      // This will be tested once we integrate the client
      // For now, just ensure error handling is in place
      // (Depends on D4 implementation being available)
    });
  });

  describe('Same port distance', () => {
    it('returns 0 distance for same origin and dest', async () => {
      const result = await getDistance(db, 'SGSIN', 'SGSIN', 'direct');
      expect(result.distanceNm).toBe(0);
      expect(result.source).toBe('cache');
    });
  });
});
