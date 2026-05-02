/**
 * Seed verification test:
 * After running seedPortDa with mocked LLM, the table should contain
 * exactly 30 unique port_codes and all confidence values must be
 * within {verified, estimated, low}.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { seedPortDa, type LlmCaller, type LlmGapBracket } from '../../../scripts/seed-port-da';
import baselineRaw from '../../../scripts/seed-data/port-da-base.json';
import type { BaselinePort } from '../../../scripts/seed-port-da';

const baseline = baselineRaw as BaselinePort[];

const VALID_CONFIDENCE = new Set(['verified', 'estimated', 'low']);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

const mockLlmCaller: LlmCaller = jest.fn(
  async (_model, _portCode, _portName, _bracketName, dwtMin, dwtMax): Promise<LlmGapBracket> => ({
    vessel_dwt_min: dwtMin,
    vessel_dwt_max: dwtMax,
    port_dues_usd: 25000,
    pilotage_usd: 7000,
    tugs_usd: 6500,
    stevedoring_usd_per_mt: 5.0,
    confidence: 'estimated',
  }),
);

describe('seedPortDa — verification', () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = makeDb();
    await seedPortDa(db, baseline, mockLlmCaller);
  });

  it('has exactly 38 unique port_codes after seed', () => {
    const row = db.prepare<[], { count: number }>(
      'SELECT COUNT(DISTINCT port_code) AS count FROM port_da_estimates',
    ).get();
    expect(row!.count).toBe(38);
  });

  it('all rows have confidence within {verified, estimated, low}', () => {
    const rows = db.prepare<[], { confidence: string }>(
      'SELECT DISTINCT confidence FROM port_da_estimates',
    ).all();
    for (const { confidence } of rows) {
      expect(VALID_CONFIDENCE.has(confidence)).toBe(true);
    }
  });

  it('all rows have a non-empty source', () => {
    const bad = db.prepare<[], { port_code: string }>(
      "SELECT port_code FROM port_da_estimates WHERE source IS NULL OR source = ''",
    ).all();
    expect(bad).toHaveLength(0);
  });

  it('is idempotent — second seed does not duplicate rows', async () => {
    const countBefore = (db.prepare<[], { count: number }>(
      'SELECT COUNT(*) AS count FROM port_da_estimates',
    ).get())!.count;

    await seedPortDa(db, baseline, mockLlmCaller);

    const countAfter = (db.prepare<[], { count: number }>(
      'SELECT COUNT(*) AS count FROM port_da_estimates',
    ).get())!.count;

    expect(countAfter).toBe(countBefore);
  });
});
