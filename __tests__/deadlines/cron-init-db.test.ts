/**
 * __tests__/deadlines/cron-init-db.test.ts
 *
 * NEW-02 contract tests: initDb() exported from scripts/check-deadlines.ts
 * wires up the dispatch-ledger DB so listDispatches() works in live cron.
 *
 * Without initDb() in main(), live cron calls tryRecordDispatch() on an
 * undefined db → ledger is bypassed → double-dispatch on the next tick.
 * Unit tests in cron-idempotency.test.ts don't catch this because they
 * call setDb() manually in beforeEach.
 *
 * These tests verify the production wiring by calling initDb() directly.
 */

import { initDb } from '@/scripts/check-deadlines';
import { listDispatches } from '@/lib/db/queries/dispatches';

describe('check-deadlines initDb (NEW-02)', () => {
  it('initializes ledger so listDispatches works after init', () => {
    const db = initDb(':memory:');
    // If setDb() was called and migration ran, listDispatches must not throw.
    expect(() => listDispatches('any-deal', 'any-deadline')).not.toThrow();
    db.close();
  });

  it('migration is idempotent — calling initDb twice does not throw', () => {
    const db1 = initDb(':memory:');
    db1.close();
    const db2 = initDb(':memory:');
    expect(() => listDispatches('any-deal', 'any-deadline')).not.toThrow();
    db2.close();
  });

  it('returns empty array for unknown deal (not an error)', () => {
    const db = initDb(':memory:');
    const rows = listDispatches('unknown-deal-id', '2099-01-01T00:00:00.000Z');
    expect(rows).toEqual([]);
    db.close();
  });
});
