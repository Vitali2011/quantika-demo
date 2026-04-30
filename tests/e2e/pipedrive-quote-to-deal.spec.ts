/**
 * E2E (jest, mocked HTTP): Quote accept → Pipedrive deal created
 * spec-beta-02: intercept Pipedrive API calls, verify POST /deals payload
 *
 * Simulates the full flow:
 *   1. syncQuoteAccepted called with accepted quote data
 *   2. GET /persons/search → empty (new contact)
 *   3. POST /persons → person created
 *   4. POST /deals → deal created with correct payload (route, vessel, ETA)
 *   5. Mapping row persisted in DB
 *
 * All calls to https://api.pipedrive.com/** are intercepted via jest.spyOn(global, 'fetch').
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { syncQuoteAccepted } from '@/lib/integrations/pipedrive/sync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

async function getToken(): Promise<string> {
  return 'e2e-mock-access-token';
}

// ---------------------------------------------------------------------------
// E2E: Quote accept → Pipedrive deal created
// ---------------------------------------------------------------------------

describe('E2E: quote accept → Pipedrive deal created (mocked HTTP)', () => {
  let db: Database.Database;
  let fetchSpy: jest.SpyInstance;

  const ACCEPTED_QUOTE = {
    quoteId: 9001,
    contactEmail: 'captain@freight.example.com',
    contactName: 'Captain Freight',
    dealValue: 25000,
    dealCurrency: 'USD',
    route: 'Shanghai → Rotterdam',
    vessel: 'MSC AURORA',
    eta: '2026-07-20',
  };

  beforeEach(() => {
    db = makeDb();

    // Intercept all fetch calls — respond per path
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;

      // Persons search → empty
      if (url.includes('/persons/search')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { items: [] } }),
        } as unknown as Response;
      }

      // POST /persons → created id=42
      if (url.includes('/persons') && !url.includes('/search')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 42 } }),
        } as unknown as Response;
      }

      // POST /deals → created id=777
      if (url.includes('/deals')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { id: 777 } }),
        } as unknown as Response;
      }

      // Unexpected call
      return { ok: false, status: 404, text: async () => 'not found' } as unknown as Response;
    });
  });

  afterEach(() => {
    db.close();
    fetchSpy.mockRestore();
  });

  it('sends POST /deals with correct payload when quote is accepted', async () => {
    await syncQuoteAccepted(ACCEPTED_QUOTE, () => db, getToken);

    // Verify POST /deals was called
    const dealCall = fetchSpy.mock.calls.find(([url]) => {
      const u = typeof url === 'string' ? url : (url as Request).url;
      return u.includes('/deals') && !u.includes('/search');
    });
    expect(dealCall).toBeDefined();

    const [, options] = dealCall!;
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;

    expect(body.value).toBe(25000);
    expect(body.currency).toBe('USD');
    expect(body.person_id).toBe(42);
    expect(body.title).toContain('9001');

    const customFields = body.custom_fields as Record<string, unknown>;
    expect(customFields.route).toBe('Shanghai → Rotterdam');
    expect(customFields.vessel).toBe('MSC AURORA');
    expect(customFields.eta).toBe('2026-07-20');
  });

  it('persists deal mapping after successful sync', async () => {
    await syncQuoteAccepted(ACCEPTED_QUOTE, () => db, getToken);

    const row = db
      .prepare<[number], { pipedrive_deal_id: number }>(
        'SELECT pipedrive_deal_id FROM pipedrive_deal_mapping WHERE quote_id = ?'
      )
      .get(9001);

    expect(row?.pipedrive_deal_id).toBe(777);
  });

  it('does NOT call Pipedrive again when same quote is synced twice', async () => {
    await syncQuoteAccepted(ACCEPTED_QUOTE, () => db, getToken);
    const callsAfterFirst = fetchSpy.mock.calls.length;

    await syncQuoteAccepted(ACCEPTED_QUOTE, () => db, getToken);
    const callsAfterSecond = fetchSpy.mock.calls.length;

    expect(callsAfterSecond).toBe(callsAfterFirst); // no new Pipedrive calls
  });
});
