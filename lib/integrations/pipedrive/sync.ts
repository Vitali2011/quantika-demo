/**
 * Pipedrive sync: upsert contact + create deal for accepted quotes.
 *
 * Input contracts:
 *  - quoteId must be a positive integer (> 0, finite), else throws
 *  - contactEmail must be non-empty, else throws
 *  - newStatus must be non-empty, else throws
 *  - Idempotent: if pipedrive_deal_mapping row exists, skip
 */
import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import { callPipedrive } from './client';
import {
  STAGE_ID_MAP,
  type PipedrivePersonSearchResult,
  type PipedriveDealCreateResponse,
  type PipedriveDealMappingRow,
  type SyncQuotePayload,
} from './types';

function defaultGetDb(): Database.Database {
  return getStore().getDatabase();
}

function validateQuoteId(quoteId: number): void {
  if (!Number.isFinite(quoteId) || !Number.isInteger(quoteId) || quoteId <= 0) {
    throw new RangeError(`quoteId must be a positive integer, got: ${String(quoteId)}`);
  }
}

/**
 * Sync an accepted quote to Pipedrive: upsert contact + create deal.
 * Idempotent: if mapping already exists, returns immediately.
 */
export async function syncQuoteAccepted(
  payload: SyncQuotePayload,
  getDb: () => Database.Database = defaultGetDb,
  getToken: (accountId?: number) => Promise<string> = async () => {
    throw new Error('getToken not configured');
  },
): Promise<void> {
  validateQuoteId(payload.quoteId);
  if (!payload.contactEmail) throw new Error('contactEmail must be non-empty');

  const db = getDb();

  // Idempotency check
  const existing = db.prepare<[number], PipedriveDealMappingRow>(
    'SELECT * FROM pipedrive_deal_mapping WHERE quote_id = ?'
  ).get(payload.quoteId);
  if (existing) return;

  const accessToken = await getToken();
  const apiDomain = process.env.PIPEDRIVE_API_DOMAIN ?? 'api.pipedrive.com';

  // 1. Search for existing person by email
  const searchResult = await callPipedrive<PipedrivePersonSearchResult>(
    `/persons/search?term=${encodeURIComponent(payload.contactEmail)}&fields=email&exact_match=true`,
    'GET',
    apiDomain,
    accessToken,
  );

  let personId: number;

  if (searchResult.data.items.length > 0) {
    personId = searchResult.data.items[0].item.id;
    await callPipedrive(
      `/persons/${String(personId)}`,
      'PUT',
      apiDomain,
      accessToken,
      { name: payload.contactName, email: payload.contactEmail },
    );
  } else {
    const created = await callPipedrive<{ success: boolean; data: { id: number } }>(
      '/persons',
      'POST',
      apiDomain,
      accessToken,
      { name: payload.contactName, email: payload.contactEmail },
    );
    personId = created.data.id;
  }

  // 2. Create deal
  const deal = await callPipedrive<PipedriveDealCreateResponse>(
    '/deals',
    'POST',
    apiDomain,
    accessToken,
    {
      title: `Quote #${String(payload.quoteId)} — ${payload.route ?? ''}`,
      person_id: personId,
      value: payload.dealValue,
      currency: payload.dealCurrency,
      custom_fields: {
        route: payload.route,
        vessel: payload.vessel,
        eta: payload.eta,
      },
    },
  );

  // 3. Persist mapping
  const nowSeconds = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO pipedrive_deal_mapping (quote_id, pipedrive_deal_id, synced_at) VALUES (?, ?, ?)'
  ).run(payload.quoteId, deal.data.id, nowSeconds);
}

/**
 * Update deal stage in Pipedrive based on internal status string.
 */
export async function updateDealStatus(
  quoteId: number,
  newStatus: string,
  getDb: () => Database.Database = defaultGetDb,
  getToken: (accountId?: number) => Promise<string> = async () => {
    throw new Error('getToken not configured');
  },
): Promise<void> {
  validateQuoteId(quoteId);
  if (!newStatus) throw new Error('newStatus must be non-empty');

  const db = getDb();

  const mapping = db.prepare<[number], PipedriveDealMappingRow>(
    'SELECT * FROM pipedrive_deal_mapping WHERE quote_id = ?'
  ).get(quoteId);

  if (!mapping) {
    throw new Error(`No Pipedrive deal mapping found for quoteId: ${String(quoteId)}`);
  }

  const accessToken = await getToken();
  const apiDomain = process.env.PIPEDRIVE_API_DOMAIN ?? 'api.pipedrive.com';
  const stageId = STAGE_ID_MAP[newStatus];

  await callPipedrive(
    `/deals/${String(mapping.pipedrive_deal_id)}`,
    'PUT',
    apiDomain,
    accessToken,
    {
      ...(stageId !== undefined ? { stage_id: stageId } : {}),
      status: newStatus === 'won' ? 'won' : newStatus === 'lost' ? 'lost' : 'open',
    },
  );
}
