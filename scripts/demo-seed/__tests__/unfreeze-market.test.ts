import * as path from 'path';
import { resolveTargetDb, CRON_STEPS } from '../unfreeze-market';

describe('unfreeze-market: DB targeting', () => {
  it('defaults to data/demo-seed.db', () => {
    expect(resolveTargetDb([])).toBe(path.resolve(process.cwd(), 'data/demo-seed.db'));
  });

  it('honors --db flag', () => {
    const p = resolveTargetDb(['--db', '/tmp/x.db']);
    expect(p).toBe(path.resolve('/tmp/x.db'));
  });

  it('refuses to target sessions.db (guard against clobbering live sessions)', () => {
    expect(() => resolveTargetDb(['--db', 'data/sessions.db'])).toThrow(/refuse/i);
  });
});

describe('unfreeze-market: cron roster', () => {
  it('runs exactly the three existing crons (no new scrapers)', () => {
    expect(CRON_STEPS.map((s) => s.script)).toEqual([
      'scripts/knowledge/cron/refresh-market-indices.ts',
      'scripts/knowledge/cron/refresh-bunker.ts',
      'scripts/knowledge/cron/refresh-eua.ts',
    ]);
  });

  it('labels each step for the roll-up summary', () => {
    expect(CRON_STEPS.map((s) => s.label)).toEqual(['baltic', 'bunker', 'eua']);
  });
});
