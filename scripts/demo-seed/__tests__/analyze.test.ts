import { analyze } from '../analyze';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../../../__tests__/fixtures/demo-seed');

describe('analyze (Phase 0)', () => {
  it('reads all fixture emails', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(m.raw_emails_count).toBe(5);
    expect(Object.keys(m.offsets)).toHaveLength(5);
  });

  it('produces ManifestSchema-valid output', async () => {
    const { ManifestSchema } = await import('../manifest-schema');
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(() => ManifestSchema.parse(m)).not.toThrow();
  });

  it('is deterministic — same input → same output', async () => {
    const m1 = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    const m2 = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // Strip generated_at (the only non-deterministic field)
    const norm = (m: typeof m1) => ({ ...m, generated_at: 'FIXED' });
    expect(norm(m1)).toEqual(norm(m2));
  });
});
