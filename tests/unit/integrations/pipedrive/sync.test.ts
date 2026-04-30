/**
 * TDD tests for lib/integrations/pipedrive/sync.ts
 * spec-beta-02: upsert contact + create deal, idempotency, status update
 *
 * Input contracts exercised:
 *  | Class             | Input                                | Outcome       |
 *  |-------------------|--------------------------------------|---------------|
 *  | Empty / falsy     | quoteId=0, contactEmail=""           | throws        |
 *  | Special floats    | quoteId=NaN, quoteId=Infinity        | throws        |
 *  | Negative domain   | quoteId=-1                           | throws        |
 *  | Idempotent        | repeat syncQuoteAccepted same quoteId| no-op (skip)  |
 *  | Non-existent map  | updateDealStatus for unmapped quoteId| throws        |
 *  | Empty status      | newStatus=""                         | throws        |
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

// ---------------------------------------------------------------------------
// Mock callPipedrive once for the entire file.
// Do NOT call jest.resetModules() — that would lose the mock binding.
// ---------------------------------------------------------------------------
jest.mock('@/lib/integrations/pipedrive/client', () => ({
  callPipedrive: jest.fn(),
}));

import { callPipedrive } from '@/lib/integrations/pipedrive/client';
const mockCallPipedrive = callPipedrive as jest.MockedFunction<typeof callPipedrive>;

import { syncQuoteAccepted, updateDealStatus } from '@/lib/integrations/pipedrive/sync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

const BASE_PAYLOAD = {
  quoteId: 1,
  contactEmail: 'test@example.com',
  contactName: 'Test User',
  dealValue: 5000,
  dealCurrency: 'USD',
  route: 'Shanghai → Rotterdam',
  vessel: 'MSC AURORA',
  eta: '2026-06-15',
};

async function getToken(): Promise<string> {
  return 'mock-access-token';
}

// ---------------------------------------------------------------------------
// syncQuoteAccepted
// ---------------------------------------------------------------------------

describe('sync — syncQuoteAccepted', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    mockCallPipedrive.mockClear();
  });

  afterEach(() => {
    db.close();
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it('throws RangeError when quoteId=0', async () => {
    await expect(
      syncQuoteAccepted({ ...BASE_PAYLOAD, quoteId: 0 }, () => db, getToken)
    ).rejects.toThrow(RangeError);
  });

  it('throws RangeError when quoteId=-1', async () => {
    await expect(
      syncQuoteAccepted({ ...BASE_PAYLOAD, quoteId: -1 }, () => db, getToken)
    ).rejects.toThrow(RangeError);
  });

  it('throws RangeError when quoteId=NaN', async () => {
    await expect(
      syncQuoteAccepted({ ...BASE_PAYLOAD, quoteId: NaN }, () => db, getToken)
    ).rejects.toThrow(RangeError);
  });

  it('throws RangeError when quoteId=Infinity', async () => {
    await expect(
      syncQuoteAccepted({ ...BASE_PAYLOAD, quoteId: Infinity }, () => db, getToken)
    ).rejects.toThrow(RangeError);
  });

  it('throws when contactEmail is empty', async () => {
    await expect(
      syncQuoteAccepted({ ...BASE_PAYLOAD, contactEmail: '' }, () => db, getToken)
    ).rejects.toThrow();
  });

  // ── New email → POST /persons then POST /deals ────────────────────────────

  it('creates new person and deal when email not found in Pipedrive', async () => {
    mockCallPipedrive
      // GET /persons/search → empty
      .mockResolvedValueOnce({ success: true, data: { items: [] } })
      // POST /persons → new id=77
      .mockResolvedValueOnce({ success: true, data: { id: 77 } })
      // POST /deals → id=100
      .mockResolvedValueOnce({ success: true, data: { id: 100 } });

    await syncQuoteAccepted(BASE_PAYLOAD, () => db, getToken);

    expect(mockCallPipedrive).toHaveBeenCalledTimes(3);

    const calls = mockCallPipedrive.mock.calls;
    expect(calls[0][0]).toContain('/persons/search');
    expect(calls[1][1]).toBe('POST');
    expect(calls[1][0]).toBe('/persons');
    expect(calls[2][0]).toBe('/deals');
    expect(calls[2][1]).toBe('POST');

    const row = db
      .prepare<[number], { pipedrive_deal_id: number }>(
        'SELECT pipedrive_deal_id FROM pipedrive_deal_mapping WHERE quote_id = ?'
      )
      .get(1);
    expect(row?.pipedrive_deal_id).toBe(100);
  });

  // ── Existing email → PUT /persons then POST /deals ────────────────────────

  it('updates existing person and creates deal when email already in Pipedrive', async () => {
    mockCallPipedrive
      // GET /persons/search → found id=55
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ item: { id: 55, name: 'Old Name', emails: [{ value: 'test@example.com' }] } }],
        },
      })
      // PUT /persons/55
      .mockResolvedValueOnce({ success: true, data: { id: 55 } })
      // POST /deals → id=200
      .mockResolvedValueOnce({ success: true, data: { id: 200 } });

    await syncQuoteAccepted(BASE_PAYLOAD, () => db, getToken);

    expect(mockCallPipedrive).toHaveBeenCalledTimes(3);
    const [, personCall] = mockCallPipedrive.mock.calls;
    expect(personCall[1]).toBe('PUT');
    expect(personCall[0]).toContain('/persons/55');
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('is idempotent: second syncQuoteAccepted for same quoteId does nothing', async () => {
    mockCallPipedrive
      .mockResolvedValueOnce({ success: true, data: { items: [] } })
      .mockResolvedValueOnce({ success: true, data: { id: 11 } })
      .mockResolvedValueOnce({ success: true, data: { id: 999 } });

    await syncQuoteAccepted(BASE_PAYLOAD, () => db, getToken);
    expect(mockCallPipedrive).toHaveBeenCalledTimes(3);

    mockCallPipedrive.mockClear();
    await syncQuoteAccepted(BASE_PAYLOAD, () => db, getToken);
    expect(mockCallPipedrive).toHaveBeenCalledTimes(0);

    const count = db
      .prepare<[number], { cnt: number }>(
        'SELECT COUNT(*) as cnt FROM pipedrive_deal_mapping WHERE quote_id = ?'
      )
      .get(1);
    expect(count?.cnt).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// updateDealStatus
// ---------------------------------------------------------------------------

describe('sync — updateDealStatus', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    mockCallPipedrive.mockClear();
  });

  afterEach(() => {
    db.close();
  });

  it('throws RangeError when quoteId=0', async () => {
    await expect(updateDealStatus(0, 'won', () => db, getToken)).rejects.toThrow(RangeError);
  });

  it('throws RangeError when quoteId=-1', async () => {
    await expect(updateDealStatus(-1, 'open', () => db, getToken)).rejects.toThrow(RangeError);
  });

  it('throws when newStatus is empty', async () => {
    await expect(updateDealStatus(1, '', () => db, getToken)).rejects.toThrow();
  });

  it('throws when no mapping exists for quoteId', async () => {
    await expect(updateDealStatus(42, 'won', () => db, getToken)).rejects.toThrow();
  });

  it('calls PUT /deals/{id} with correct status when mapping exists', async () => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO pipedrive_deal_mapping (quote_id, pipedrive_deal_id, synced_at) VALUES (?, ?, ?)'
    ).run(5, 300, now);

    mockCallPipedrive.mockResolvedValueOnce({ success: true, data: { id: 300 } });

    await updateDealStatus(5, 'won', () => db, getToken);

    expect(mockCallPipedrive).toHaveBeenCalledTimes(1);
    const [path, method, , , body] = mockCallPipedrive.mock.calls[0];
    expect(path).toContain('/deals/300');
    expect(method).toBe('PUT');
    expect((body as Record<string, unknown>).status).toBe('won');
  });
});
