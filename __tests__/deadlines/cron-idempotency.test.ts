/**
 * wave-γ-4 Task 4 (NEW-02): pin down the cron→idempotency chain.
 *
 * Architecturally, scripts/check-deadlines.ts (the cron entry) delegates
 * each deadline to processDeadline() in lib/deadlines/subs-guardian.ts,
 * which in turn calls tryRecordDispatch() in lib/db/queries/dispatches.ts.
 * This test pins that chain end-to-end with a real (in-memory) ledger so
 * any future refactor that bypasses the ledger fails loudly.
 *
 * Why this exists: Recursive bug audit 2026-05-03 (RC7 wrong entry point)
 * — original βf3-03 spec targeted subs-guardian middleware while a reviewer
 * looking at scripts/check-deadlines.ts could not see the idempotency
 * wiring. The two-line comment in the cron entry plus this behavioural
 * test make the contract explicit.
 */

import * as fs from 'fs';
import Database from 'better-sqlite3';
import { processDeadline, type SubsDeadline } from '@/lib/deadlines/subs-guardian';
import { setDb, listDispatches } from '@/lib/db/queries/dispatches';
import migration011 from '@/lib/migrations/011-notified-dispatches';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  migration011.up(db);
  setDb(db);
});

afterEach(() => {
  db.close();
});

describe('wave-γ-4: cron deadline scan idempotency contract', () => {
  it('processing the same deadline twice dispatches notifications ONCE (DB ledger blocks duplicates)', async () => {
    // Deadline 2h away → triggers the '2h' stage (highest urgency before expiry).
    const deadline: SubsDeadline = {
      dealId: 'deal-A',
      counterparty: 'TestCharterer',
      deadlineAt: new Date(Date.now() + 2 * 3_600_000 - 60_000).toISOString(),
      stage: 'pending',
      notifiedStages: [],
    };

    const dispatcherCalls: string[] = [];
    const dispatcher = async (channel: string) => {
      dispatcherCalls.push(channel);
    };

    // First scan — full dispatch
    const first = await processDeadline(deadline, dispatcher as any);
    expect(first.notificationsDispatched.length).toBeGreaterThan(0);
    const firstChannels = [...first.notificationsDispatched];

    // Simulate a fresh process restart by clearing the in-memory fast-path
    // (notifiedStages). The DB ledger is the source of truth across restarts.
    deadline.notifiedStages = [];
    deadline.stage = 'pending';

    // Second scan — DB ledger should block all dispatches.
    const second = await processDeadline(deadline, dispatcher as any);
    expect(second.notificationsDispatched).toEqual([]);

    // Cumulative dispatcher invocations equal the FIRST scan's channels.
    expect(dispatcherCalls).toEqual(firstChannels);

    // Ledger contains exactly one row per channel for this deal+deadline.
    const ledger = listDispatches(deadline.dealId, deadline.deadlineAt);
    expect(ledger.length).toBe(firstChannels.length);
  });

  it('different deadline timestamps for the same deal are independent (ledger keyed on both)', async () => {
    const dispatcher = jest.fn(async () => undefined);

    const baseAt = Date.now() + 2 * 3_600_000 - 60_000;
    const a: SubsDeadline = {
      dealId: 'deal-B',
      counterparty: 'X',
      deadlineAt: new Date(baseAt).toISOString(),
      stage: 'pending',
      notifiedStages: [],
    };
    const b: SubsDeadline = {
      ...a,
      deadlineAt: new Date(baseAt + 5 * 60_000).toISOString(), // 5min later
      notifiedStages: [],
    };

    const r1 = await processDeadline(a, dispatcher);
    const r2 = await processDeadline(b, dispatcher);

    // Both deadlines are distinct — both must dispatch.
    expect(r1.notificationsDispatched.length).toBeGreaterThan(0);
    expect(r2.notificationsDispatched.length).toBeGreaterThan(0);
  });
});

describe('wave-γ-4: scripts/check-deadlines.ts wiring contract (RC7 documentation guard)', () => {
  it('cron entry delegates to processDeadline (any refactor bypassing it must update this test)', () => {
    const src = fs.readFileSync(
      require.resolve('../../scripts/check-deadlines.ts'),
      'utf8',
    );
    expect(src).toMatch(/from\s+['"][^'"]*lib\/deadlines\/subs-guardian['"]/);
    expect(src).toMatch(/processDeadline\s*\(/);
  });

  it('cron entry comment names the idempotency source of truth so reviewers do not have to trace imports', () => {
    const src = fs.readFileSync(
      require.resolve('../../scripts/check-deadlines.ts'),
      'utf8',
    );
    // Documentation contract: a reviewer looking at the cron file sees
    // immediately where idempotency lives.
    expect(src).toMatch(/tryRecordDispatch/);
    expect(src).toMatch(/lib\/db\/queries\/dispatches/);
  });
});
