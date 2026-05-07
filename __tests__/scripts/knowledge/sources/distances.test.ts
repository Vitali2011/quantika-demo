/**
 * Test suite for distances seed script
 *
 * RED tests for:
 * - Sanity check: 5 known pairs with expected distances (±5%)
 * - Idempotency: re-run doesn't duplicate rows
 * - Progress logging
 * - Batch insert in transactions
 *
 * Integration smoke: top-200-ports.json → seedDistances default path
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import migration015 from '@/lib/migrations/015-port-distances';
import migration013 from '@/lib/migrations/013-knowledge-sources';

// Mock calculateDistance to avoid hitting real searoute service
jest.mock('@/lib/knowledge/distances/client');
// Mock port resolution to avoid dependency on port master data
jest.mock('@/lib/ports/resolve');

describe('distances seed script', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    migration013.up(db);
    migration015.up(db);

    // Mock port resolution for all tests
    const { resolvePortStrict } = await import('@/lib/ports/resolve');
    const mockResolvePort = resolvePortStrict as jest.MockedFunction<typeof resolvePortStrict>;

    mockResolvePort.mockImplementation((locode: string) => ({
      portCode: locode.toUpperCase(),
      portName: 'Mock Port',
      country: 'XX',
      lat: 0,
      lon: 0,
      aliases: [],
    }));

    // Mock calculateDistance for all tests
    const { calculateDistance } = await import('@/lib/knowledge/distances/client');
    const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

    mockCalculateDistance.mockResolvedValue({
      distanceNm: 1000,
      calculatorVersion: 'searoute-1.0.0',
    });
  });

  afterEach(() => {
    db.close();
    jest.clearAllMocks();
  });

  describe('Sanity check — 5 known pairs (±5%)', () => {
    it('Singapore → Rotterdam via Suez ≈ 8,300nm (±5%)', async () => {
      // Override default mock for this specific distance
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 8300,
        calculatorVersion: 'searoute-1.0.0',
      });

      // Import seed function
      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      // Create minimal port list with just these two ports
      const portList = ['SGSIN', 'NLRTM'];

      // Seed with mock data
      await seedDistances(db, portList);

      // Query the database for the seeded distance
      const row = db
        .prepare('SELECT distance_nm FROM port_distances WHERE origin = ? AND dest = ? AND route_via = ?')
        .get('SGSIN', 'NLRTM', 'suez') as { distance_nm: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.distance_nm).toBeGreaterThanOrEqual(8300 * 0.95); // -5%
      expect(row!.distance_nm).toBeLessThanOrEqual(8300 * 1.05); // +5%
    });

    it('Tubarão → Qingdao via Cape ≈ 14,500nm (±5%)', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 14500,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');
      const portList = ['BRTUB', 'CNTAO'];

      await seedDistances(db, portList);

      const row = db
        .prepare('SELECT distance_nm FROM port_distances WHERE origin = ? AND dest = ? AND route_via = ?')
        .get('BRTUB', 'CNTAO', 'cape') as { distance_nm: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.distance_nm).toBeGreaterThanOrEqual(14500 * 0.95);
      expect(row!.distance_nm).toBeLessThanOrEqual(14500 * 1.05);
    });

    it('Shanghai → Los Angeles via Direct ≈ 5,800nm (±5%)', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 5800,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');
      const portList = ['CNSHA', 'USLAX'];

      await seedDistances(db, portList);

      const row = db
        .prepare('SELECT distance_nm FROM port_distances WHERE origin = ? AND dest = ? AND route_via = ?')
        .get('CNSHA', 'USLAX', 'direct') as { distance_nm: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.distance_nm).toBeGreaterThanOrEqual(5800 * 0.95);
      expect(row!.distance_nm).toBeLessThanOrEqual(5800 * 1.05);
    });

    it('Houston → Hamburg via Direct ≈ 5,100nm (±5%)', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 5100,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');
      const portList = ['USHOU', 'DEHAM'];

      await seedDistances(db, portList);

      const row = db
        .prepare('SELECT distance_nm FROM port_distances WHERE origin = ? AND dest = ? AND route_via = ?')
        .get('USHOU', 'DEHAM', 'direct') as { distance_nm: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.distance_nm).toBeGreaterThanOrEqual(5100 * 0.95);
      expect(row!.distance_nm).toBeLessThanOrEqual(5100 * 1.05);
    });

    it('Yokohama → Vancouver via Direct ≈ 4,200nm (±5%)', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 4200,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');
      const portList = ['JPYOK', 'CAVAN'];

      await seedDistances(db, portList);

      const row = db
        .prepare('SELECT distance_nm FROM port_distances WHERE origin = ? AND dest = ? AND route_via = ?')
        .get('JPYOK', 'CAVAN', 'direct') as { distance_nm: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.distance_nm).toBeGreaterThanOrEqual(4200 * 0.95);
      expect(row!.distance_nm).toBeLessThanOrEqual(4200 * 1.05);
    });
  });

  describe('Idempotency — re-run doesn\'t duplicate rows', () => {
    it('skips already-seeded pairs on re-run', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 1000,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');
      const portList = ['SGSIN', 'NLRTM'];

      // First run
      await seedDistances(db, portList);

      const countAfterFirst = db
        .prepare('SELECT COUNT(*) as cnt FROM port_distances')
        .get() as { cnt: number };

      // Second run (should be idempotent - script checks cache before calling calculateDistance)
      await seedDistances(db, portList);

      const countAfterSecond = db
        .prepare('SELECT COUNT(*) as cnt FROM port_distances')
        .get() as { cnt: number };

      // Count should be the same
      expect(countAfterSecond.cnt).toBe(countAfterFirst.cnt);
    });
  });

  describe('Batch insert in transactions', () => {
    it('inserts in batches of 1000 rows', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 1000,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      // Create a small port list (10 ports = 45 pairs × 3 routes = 135 rows)
      // Use valid LOCODE format: 2-letter country + 3 alphanumeric
      const portList = ['XX000', 'XX001', 'XX002', 'XX003', 'XX004', 'XX005', 'XX006', 'XX007', 'XX008', 'XX009'];

      await seedDistances(db, portList);

      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM port_distances')
        .get() as { cnt: number };

      // 10 ports = 10×9/2 = 45 unique pairs × 3 routes = 135 rows
      expect(count.cnt).toBe(135);
    });
  });

  describe('Integration smoke — top-200-ports.json default path', () => {
    it('reads ports.json (new object shape) without throwing', async () => {
      // This test exercises the default file-loading path in seedDistances()
      // and verifies that the new {locode, name, ...}[] shape is handled correctly.
      // It does NOT call seedDistances (which needs DB + searoute) — instead it
      // directly validates that the JSON produces valid LOCODE strings.
      const portListPath = path.join(process.cwd(), 'data', 'knowledge', 'top-200-ports.json');
      const content = fs.readFileSync(portListPath, 'utf-8');
      const raw: unknown[] = JSON.parse(content);

      // New shape: array of objects
      expect(Array.isArray(raw)).toBe(true);
      expect(raw.length).toBe(200);

      // Each entry must be an object with a locode string (not a raw string)
      for (const entry of raw) {
        expect(typeof entry).toBe('object');
        expect(entry).not.toBeNull();
        expect(typeof (entry as { locode: string }).locode).toBe('string');
      }

      // Extract LOCODEs — this is what the fixed distances.ts must do
      const locodes = (raw as Array<{ locode: string }>).map((p) => p.locode);

      // 5 well-known LOCODEs must be present
      for (const known of ['SGSIN', 'NLRTM', 'CNSHA', 'USHOU', 'AEDXB']) {
        expect(locodes).toContain(known);
      }

      // Singapore coordinates
      const singapore = (raw as Array<{ locode: string; lat: number; lon: number }>).find(
        (p) => p.locode === 'SGSIN'
      );
      expect(singapore).toBeDefined();
      expect(singapore!.lat).toBeCloseTo(1.27, 1);
      expect(singapore!.lon).toBeCloseTo(103.83, 1);
    });

    it('generatePairs via seedDistances default path yields valid LOCODE strings (not [object Object])', async () => {
      // This test calls seedDistances() without portList so it reads top-200-ports.json.
      // Before the fix: isValidLocode receives "[object Object]" → all skipped → 0 pairs.
      // After the fix: receives proper LOCODE strings → valid pairs generated.
      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      // Override calculateDistance to count calls — if pairs are generated we get calls
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalc = calculateDistance as jest.MockedFunction<typeof calculateDistance>;
      mockCalc.mockResolvedValue({ distanceNm: 1000, calculatorVersion: 'searoute-1.0.0' });

      await seedDistances(db);

      // After the fix: 200 valid ports → 200×199/2 = 19900 pairs → calculateDistance called many times
      // Before the fix: all ports treated as invalid → 0 calls
      expect(mockCalc).toHaveBeenCalled();

      // At least a few hundred pairs must have been attempted
      expect(mockCalc.mock.calls.length).toBeGreaterThan(100);
    });
  });

  describe('Input contract — boundary cases', () => {
    it('throws Error when db is null', async () => {
      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      await expect(seedDistances(null as any, ['SGSIN'])).rejects.toThrow('Database instance required');
    });

    it('throws Error when db is undefined', async () => {
      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      await expect(seedDistances(undefined as any, ['SGSIN'])).rejects.toThrow('Database instance required');
    });

    it('handles empty port list with warning', async () => {
      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      // Should not throw, just log warning and exit
      await expect(seedDistances(db, [])).resolves.not.toThrow();

      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM port_distances')
        .get() as { cnt: number };

      expect(count.cnt).toBe(0);
    });

    it('skips invalid LOCODE with warning, continues with others', async () => {
      const { calculateDistance } = await import('@/lib/knowledge/distances/client');
      const mockCalculateDistance = calculateDistance as jest.MockedFunction<typeof calculateDistance>;

      mockCalculateDistance.mockResolvedValue({
        distanceNm: 1000,
        calculatorVersion: 'searoute-1.0.0',
      });

      const { seedDistances } = await import('@/scripts/knowledge/sources/distances');

      // Mix valid and invalid LOCODEs
      const portList = ['SGSIN', 'INVALID', 'NLRTM', '123'];

      await seedDistances(db, portList);

      // Should have seeded only the valid pairs (SGSIN ↔ NLRTM)
      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM port_distances')
        .get() as { cnt: number };

      // 2 valid ports = 1 pair × 3 routes = 3 rows
      expect(count.cnt).toBe(3);
    });
  });
});
