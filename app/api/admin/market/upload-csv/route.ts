import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireAdmin } from '@/lib/auth/admin';
import { upsertIndex } from '@/lib/market/market-indices-repository';

/**
 * POST /api/admin/market/upload-csv
 *
 * Manually upload market index rows (BHSI, TMI, Drewry BB).
 * Idempotent: ON CONFLICT(index_name, index_date) DO UPDATE.
 *
 * Auth: X-Admin-Token header matching ADMIN_TOKEN env var.
 *
 * Request body:
 *   index_name: 'bhsi' | 'tmi' | 'drewry-bb'
 *   rows: Array<{ date: string; value: number; unit?: string; source_url?: string }>
 *
 * Response 200: { loaded: number; index_name: string }
 * Errors: 400 (validation), 401 (auth), 500 (misconfigured server)
 */

const VALID_INDEX_NAMES = new Set(['bhsi', 'tmi', 'drewry-bb']);

const DEFAULT_UNITS: Record<string, string> = {
  bhsi: 'USD/day',
  tmi: 'USD/day',
  'drewry-bb': 'USD/TEU',
};

interface UploadRow {
  date: string;
  value: number;
  unit?: string;
  source_url?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { index_name, rows } = body;

  if (!index_name || typeof index_name !== 'string' || index_name.trim() === '') {
    return NextResponse.json({ error: 'index_name is required' }, { status: 400 });
  }

  // Exact whitelist — substring 'bhsi' must NOT match 'bhsi-admin' (Class 6)
  if (!VALID_INDEX_NAMES.has(index_name)) {
    return NextResponse.json(
      {
        error: `Unknown index_name: ${index_name}. Must be one of: ${Array.from(VALID_INDEX_NAMES).join(', ')}`,
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 });
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as UploadRow;

    if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      return NextResponse.json(
        { error: `rows[${i}].date must be YYYY-MM-DD` },
        { status: 400 },
      );
    }

    if (
      typeof row.value !== 'number' ||
      !Number.isFinite(row.value) ||
      row.value < 0
    ) {
      return NextResponse.json(
        { error: `rows[${i}].value must be a non-negative finite number` },
        { status: 400 },
      );
    }
  }

  const db = getStore().getDb();
  const now = new Date().toISOString();
  const defaultUnit = DEFAULT_UNITS[index_name] ?? 'USD/day';

  for (const row of rows as UploadRow[]) {
    upsertIndex(db, {
      id: `${index_name}-${row.date}`,
      index_name,
      index_date: row.date,
      value: row.value,
      unit: row.unit || defaultUnit,
      source: row.source_url || 'admin-upload',
      fetched_at: now,
    });
  }

  return NextResponse.json({ loaded: (rows as UploadRow[]).length, index_name });
}
