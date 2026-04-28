import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { computeEconomics } from '@/lib/economics/index';
import type { EconomicsInput } from '@/lib/economics/index';
import type { EconomicsResult } from '@/lib/types';

export const maxDuration = 30;

// In-process cache: routeHash → { result, cachedAt }
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cache = new Map<string, { result: EconomicsResult; cachedAt: number }>();

function buildCacheKey(input: EconomicsInput, date: string): string {
  return [
    input.route.fromPort,
    input.route.toPort,
    input.route.viaCanal ?? '',
    date,
  ].join('|').toLowerCase();
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: EconomicsInput;
  try {
    body = await request.json() as EconomicsInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.route?.fromPort || !body?.route?.toPort) {
    return NextResponse.json({ error: 'Missing required fields: route.fromPort, route.toPort' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = buildCacheKey(body, today);

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.result);
  }

  try {
    const result = await Promise.race([
      computeEconomics(body),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Economics timeout')), 5_000)
      ),
    ]);

    cache.set(cacheKey, { result, cachedAt: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[economics] computeEconomics failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Economics calculation failed', detail: (err as Error).message },
      { status: 500 }
    );
  }
}
