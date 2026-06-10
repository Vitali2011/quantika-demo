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

import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import { aiRateLimiter } from '@/lib/rate-limit';

/**
 * Detect FTS5 operator syntax that causes SQLITE_ERROR when unescaped.
 * Bare operators like NEAR(, *prefix, and dangling AND/OR/NOT are rejected with 400.
 */
function isMalformedFts5Query(q: string): boolean {
  return (
    /NEAR\s*\(/i.test(q) ||
    /^\s*\*/.test(q) ||
    /^\s*(AND|OR|NOT)\b/i.test(q)
  );
}

/**
 * Escape a plain-text query for safe FTS5 MATCH binding (phrase match).
 * Mirrors lib/knowledge/embeddings/retriever-sqlite.ts.
 */
function escapeFts5Query(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  // Feature flag check
  if (process.env.BIMCO_RAG_ENABLED !== 'true') {
    return NextResponse.json({ error: 'BIMCO RAG not enabled' }, { status: 503 });
  }

  // Session auth check
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  // Rate limit check
  const { sessionId } = authResult;
  const rateResult = aiRateLimiter.check(sessionId);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) } },
    );
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

    // Reject malformed FTS5 operators before they reach SQLite
    if (query && query.trim() !== '' && isMalformedFts5Query(query)) {
      return NextResponse.json({ error: 'Invalid search query' }, { status: 400 });
    }

    // Get database
    const store = getStore();
    const db = store.getDatabase();

    // Build FTS5 query — escape to phrase match, preventing FTS5 syntax injection
    let sql: string;
    let params: any[];

    if (cpFilter && cpFilter.trim() !== '') {
      // Filter by charter party
      sql = `
        SELECT content, metadata
        FROM bimco_fts
        WHERE content MATCH ?
        LIMIT ?
      `;
      params = [query ? escapeFts5Query(query) : '*', limit];
    } else if (query && query.trim() !== '') {
      // Search without charter party filter
      sql = `
        SELECT content, metadata
        FROM bimco_fts
        WHERE content MATCH ?
        LIMIT ?
      `;
      params = [escapeFts5Query(query), limit];
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
