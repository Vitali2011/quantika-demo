/**
 * Tests for scripts/knowledge-baltic-seed.ts
 */

jest.mock('@/lib/db', () => ({ getDb: jest.fn(() => ({})) }));
jest.mock('@/lib/migrations/runner', () => ({ runMigrations: jest.fn() }));
jest.mock('@/lib/migrations/index', () => ({ allMigrations: [] }));

import { STATIC_INDICES, upsertBalticRows } from '../../scripts/knowledge-baltic-seed';

describe('STATIC_INDICES', () => {
  it('has exactly 4 entries', () => {
    expect(STATIC_INDICES).toHaveLength(4);
  });

  it('covers all 4 index codes', () => {
    const codes = STATIC_INDICES.map((r) => r.index_code);
    expect(codes).toContain('BDI');
    expect(codes).toContain('BCI');
    expect(codes).toContain('BSI');
    expect(codes).toContain('BHSI');
  });

  it('all entries have positive values', () => {
    for (const r of STATIC_INDICES) {
      expect(r.value).toBeGreaterThan(0);
    }
  });

  it('all entries have a valid ISO date', () => {
    for (const r of STATIC_INDICES) {
      expect(r.price_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('upsertBalticRows', () => {
  it('calls stmt.run for each row', () => {
    const runMock = jest.fn();
    const transactionFn = jest.fn((fn: (rows: unknown[]) => void) => {
      return (rows: unknown[]) => fn(rows);
    });
    const dbMock = {
      prepare: jest.fn(() => ({ run: runMock })),
      transaction: transactionFn,
    } as unknown as import('better-sqlite3').Database;

    const count = upsertBalticRows(dbMock, STATIC_INDICES);
    expect(count).toBe(4);
    expect(runMock).toHaveBeenCalledTimes(4);
  });
});
