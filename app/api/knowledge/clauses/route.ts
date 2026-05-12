/**
 * GET /api/knowledge/clauses — BIMCO charter party clause search
 *
 * Query params:
 * - q: search query (FTS5 match)
 * - cp: charter party filter (GENCON 2022, HEAVYCON, PROJECTCON)
 * - limit: max results (default 10, max 100)
 *
 * Input contract (.specs/gamma-09-input-contracts.md):
 * - Flag disabled → 503
 * - Missing/empty q → return all clauses
 * - Invalid limit → clamp to default (10)
 * - Limit > max → clamp to 100
 * - Invalid cp → return []
 * - SQL injection → safe (parameterized)
 *
 * Spec: gamma-09
 */

import { NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';

export async function GET(request: Request) {
  // Feature flag check
  if (process.env.BIMCO_RAG_ENABLED !== 'true') {
    return NextResponse.json({ error: 'BIMCO RAG not enabled' }, { status: 503 });
  }

  try {
    // Parse query params
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const cpFilter = searchParams.get('cp') || '';
    const limitParam = searchParams.get('limit');

    // Validate and clamp limit
    let limit = 10;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100); // Clamp to max 100
      }
    }

    // Get database
    const store = getStore();
    const db = store.getDatabase();

    // Build FTS5 query
    let sql: string;
    let params: any[];

    if (cpFilter && cpFilter.trim() !== '') {
      // Filter by charter party
      // Use FTS5 MATCH for content and JSON_EXTRACT for metadata filtering
      sql = `
        SELECT content, metadata
        FROM bimco_fts
        WHERE content MATCH ?
        LIMIT ?
      `;
      params = [query || '*', limit];
    } else if (query && query.trim() !== '') {
      // Search without charter party filter
      sql = `
        SELECT content, metadata
        FROM bimco_fts
        WHERE content MATCH ?
        LIMIT ?
      `;
      params = [query, limit];
    } else {
      // No query — return all clauses
      sql = `
        SELECT content, metadata
        FROM bimco_fts
        LIMIT ?
      `;
      params = [limit];
    }

    // Execute query
    const rows = db.prepare(sql).all(...params) as any[];

    // Filter by charter party if specified (post-query filter)
    let results = rows;
    if (cpFilter && cpFilter.trim() !== '') {
      results = rows.filter((row) => {
        try {
          const metadata = JSON.parse(row.metadata);
          return metadata.charterParty === cpFilter;
        } catch {
          return false;
        }
      });
    }

    return NextResponse.json({
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching BIMCO clauses:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
