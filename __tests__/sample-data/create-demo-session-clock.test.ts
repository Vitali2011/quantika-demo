import { describe, it, expect } from '@jest/globals';

// Freeze the demo clock to the canonical demo date so the test is deterministic
// and never touches demo_seed_meta.
jest.mock('@/lib/clock', () => ({
  now: () => new Date('2026-05-28T00:00:00.000Z'),
  today: () => '2026-05-28',
}));

import { createDemoSession } from '@/lib/sample-data/create-demo-session';
import { getSession } from '@/lib/session';
import { parseLaycan } from '@/lib/sailing/date-parsing';

describe('createDemoSession — unified frozen clock (#1024/#1018)', () => {
  it('rebases the cargo laycan cluster onto the frozen demo date, not the real wall-clock', () => {
    const id = createDemoSession();
    const session = getSession(id);
    expect(session).toBeTruthy();

    const cargos = session!.parsedCargos ?? [];
    const starts = cargos
      .map((c) => parseLaycan(c.laycan as string, 2026))
      .filter(Boolean)
      .map((r) => new Date(r!.start).toISOString().slice(0, 10));
    expect(starts.length).toBeGreaterThan(0);

    // The rebase anchors active cargoes onto `now`. Historical fixture-recap laycans
    // legitimately stay in the past, so assert the MODE (dominant cluster start) — it
    // must equal the frozen date. With real `new Date()` the cluster would shift to the
    // real wall-clock day, so this fails unless the frozen clock drives the rebase.
    const counts = new Map<string, number>();
    for (const s of starts) counts.set(s, (counts.get(s) ?? 0) + 1);
    const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(mode).toBe('2026-05-28');
  });
});
