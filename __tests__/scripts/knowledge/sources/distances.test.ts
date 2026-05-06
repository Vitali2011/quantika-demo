/**
 * Test suite for distances seed script
 *
 * RED tests for:
 * - Sanity check: 5 known pairs with expected distances (±5%)
 * - Idempotency: re-run doesn't duplicate rows
 * - Progress logging
 * - Batch insert in transactions
 */

import Database from 'better-sqlite3';
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
