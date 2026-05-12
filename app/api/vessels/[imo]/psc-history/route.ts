import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchPscHistory } from '@/lib/knowledge/sources/psc/psc-adapter';
import {
  getDetentionHistory,
  upsertInspection,
} from '@/lib/market/psc-repository';
import { getDb } from '@/lib/db/index';

const ImoSchema = z.string().regex(/^\d{7}$/, 'IMO must be 7 digits');

/**
 * Input Contract:
 * - imo: empty ("", undefined) → 400 Bad Request
 * - imo: invalid format → 400 Bad Request
 * - PSC_DETENTION_ENABLED !== 'true' → 503 Service Unavailable
 * - Valid imo + flag enabled → 200 + records array
 *
 * GET: return detention history for IMO
 * - If PSC_DETENTION_ENABLED !== 'true': return 503
 * - Attempt fetch from adapter, store results, return from DB
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imo: string }> },
) {
  // Check feature flag first
  if (process.env.PSC_DETENTION_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'PSC detention history not available' },
      { status: 503 },
    );
  }

  const { imo } = await params;

  // Validate IMO format
  const parsed = ImoSchema.safeParse(imo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid IMO format — expected 7 digits' },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    // Attempt to fetch from adapter
    const records = await fetchPscHistory(imo);

    // Store fetched records in DB
    for (const record of records) {
      upsertInspection(db, record);
    }
  } catch (error) {
    // Adapter errors are non-fatal — we'll return DB results
    // This implements fail-safe behavior per input contract
  }

  // Always return from DB (contains both fresh and cached data)
  const history = getDetentionHistory(db, imo);

  return NextResponse.json(history);
}
