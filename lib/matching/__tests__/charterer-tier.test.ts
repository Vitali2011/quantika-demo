import Database from 'better-sqlite3';
import { resolveChartererTier } from '@/lib/matching/charterer-tier';
import { upsertCharterer } from '@/lib/market/charterers-repository';
import migration026 from '@/lib/migrations/026-charterers';
import type { ParsedCargo } from '@/lib/types';

const cargo = (name: string | null): ParsedCargo =>
  ({ chartererName: name } as unknown as ParsedCargo);

describe('resolveChartererTier (audit A.1)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    upsertCharterer(db, {
      id: 'huaya-maritime',
      name: 'Huaya Maritime',
      tier: 'weak',
      payment_history: '[]',
      require_lc: 1,
      notes: null,
    });
  });

  afterEach(() => db.close());

  it('resolves exact name', () => {
    expect(resolveChartererTier(db, cargo('Huaya Maritime'))).toBe('weak');
  });

  it('resolves case/space/punctuation-insensitively', () => {
    expect(resolveChartererTier(db, cargo('  huaya  MARITIME. '))).toBe('weak');
  });

  it('null when cargo has no chartererName', () => {
    expect(resolveChartererTier(db, cargo(null))).toBeNull();
  });

  it('null when name unknown', () => {
    expect(resolveChartererTier(db, cargo('Unknown Trader'))).toBeNull();
  });
});
