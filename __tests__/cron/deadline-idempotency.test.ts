/**
 * βf3-03: DB-backed idempotency for subs deadline notifications.
 *
 * Tests verify that processDeadline() uses notified_dispatches table
 * as source of truth across process restarts — in-memory ledger alone
 * is insufficient when cron runs in separate processes.
 */

import Database from 'better-sqlite3';
import { runMigrations } from '../../lib/migrations/runner';
import { allMigrations } from '../../lib/migrations/index';
import { setDb, tryRecordDispatch, listDispatches } from '../../lib/db/queries/dispatches';
import { processDeadline, type SubsDeadline, type DispatcherFn } from '../../lib/deadlines/subs-guardian';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDeadline(overrides: Partial<SubsDeadline> = {}): SubsDeadline {
  // 3h from now → stage '4h'
  const deadlineAt = new Date(Date.now() + 3 * 3_600_000).toISOString();
  return {
    dealId: 'deal-test-001',
    counterparty: 'ACME Shipping',
    deadlineAt,
    stage: 'pending',
    notifiedStages: [],
    ...overrides,
  };
}

function makeNow(msFromNow: number): Date {
  return new Date(Date.now() + msFromNow);
}

// ── setup ─────────────────────────────────────────────────────────────────────

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db, allMigrations);
  setDb(db);
});

afterEach(() => {
  db.close();
});

// ── Test 1: same input x3 → dispatcher called exactly once ───────────────────

test('T1: processDeadline x3 same input → dispatcher called 1 time', async () => {
  const deadline = makeDeadline();
  const dispatcher = jest.fn<ReturnType<DispatcherFn>, Parameters<DispatcherFn>>();

  // 3h from now → stage '4h'; policy has in-app + whatsapp channels
  // Run 3 times with same deadline object (same notifiedStages array)
  await processDeadline(deadline, dispatcher);
  await processDeadline(deadline, dispatcher);
  await processDeadline(deadline, dispatcher);

  // '4h' policy: in-app + whatsapp (2 channels). Each channel dispatched once = 2 calls total.
  expect(dispatcher).toHaveBeenCalledTimes(2);
});

// ── Test 2: multi-channel → 2 rows in DB, dispatcher called 2 times ──────────

test('T2: multi-channel same stage → 2 DB rows, dispatcher called 2 times', async () => {
  const deadline = makeDeadline(); // stage '4h' → 2 channels

  const dispatcher = jest.fn<ReturnType<DispatcherFn>, Parameters<DispatcherFn>>();
  await processDeadline(deadline, dispatcher);

  const rows = listDispatches(deadline.dealId, deadline.deadlineAt);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.channel).sort()).toEqual(['in-app', 'whatsapp'].sort());
  expect(dispatcher).toHaveBeenCalledTimes(2);
});

// ── Test 3: cross-process simulation → DB prevents duplicate dispatch ─────────

test('T3: cross-process — clear in-memory notifiedStages → DB blocks second dispatch', async () => {
  const deadline = makeDeadline();
  const dispatcher = jest.fn<ReturnType<DispatcherFn>, Parameters<DispatcherFn>>();

  // First run: populate DB
  await processDeadline(deadline, dispatcher);
  const callsAfterFirst = dispatcher.mock.calls.length;
  expect(callsAfterFirst).toBeGreaterThan(0);

  // Simulate process restart: clear in-memory ledger (keeps same DB)
  deadline.notifiedStages = [];

  // Second run: in-memory guard is gone, but DB already has the rows
  await processDeadline(deadline, dispatcher);

  // No new calls should have been made
  expect(dispatcher).toHaveBeenCalledTimes(callsAfterFirst);
});

// ── Test 4: different stages → dispatcher called per new stage ────────────────

test('T4: different stages (24h → 8h escalation) → dispatcher called for each new stage', async () => {
  const dispatcher = jest.fn<ReturnType<DispatcherFn>, Parameters<DispatcherFn>>();

  // Stage '24h' — 20h from now → 1 channel (in-app)
  const deadline24h = makeDeadline({
    deadlineAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  await processDeadline(deadline24h, dispatcher);
  const callsAt24h = dispatcher.mock.calls.length;
  expect(callsAt24h).toBe(1); // '24h' policy: only in-app

  // Escalate same deadline to '8h' stage (mutate deadlineAt to be 6h away)
  deadline24h.deadlineAt = new Date(Date.now() + 6 * 3_600_000).toISOString();
  await processDeadline(deadline24h, dispatcher);

  // '8h' policy: in-app + whatsapp = 2 more calls
  expect(dispatcher).toHaveBeenCalledTimes(callsAt24h + 2);
});

// ── Test 5: tryRecordDispatch returns true first, false on repeat ─────────────

test('T5: tryRecordDispatch true first call, false on duplicate', () => {
  const first = tryRecordDispatch('deal-x', 'dl-y', '24h', 'in-app');
  const second = tryRecordDispatch('deal-x', 'dl-y', '24h', 'in-app');
  expect(first).toBe(true);
  expect(second).toBe(false);
});
