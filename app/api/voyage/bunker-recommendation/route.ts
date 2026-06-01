/**
 * GET /api/voyage/bunker-recommendation
 *
 * Returns the cheapest on-route bunker port for a voyage, using port-master
 * distances (no hardcoded coordinates). Falls back with an honest message when
 * no candidate port is on the route.
 *
 * Query params:
 *   from   – origin port (LOCODE or canonical name)
 *   to     – destination port (LOCODE or canonical name)
 *   grade  – VLSFO | MGO (default VLSFO)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getStore } from '@/lib/session-store';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { optimizeSplitBunker } from '@/lib/economics/split-bunker';
import type { BunkerPrice } from '@/lib/economics/bunker';

export const dynamic = 'force-dynamic';

/** The 5 global bunker hubs available in the system. */
const BUNKER_CANDIDATES = ['NLRTM', 'SGSIN', 'AEFJR', 'USHOU', 'GIGIB'] as const;

/** Port is on-route if detour is within 15% of direct distance or under 200 NM. */
const DETOUR_RATIO = 0.15;
const DETOUR_ABS_CAP_NM = 200;

export interface BunkerRecommendationResponse {
  fallback: boolean;
  message: string | null;
  port: string | null;
  priceUsdPerMt: number | null;
  recommendation: string | null;
  savingsUsd: number;
}

export async function GET(req: NextRequest): Promise<NextResponse<BunkerRecommendationResponse>> {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const gradeRaw = (url.searchParams.get('grade') ?? 'VLSFO').toUpperCase();
  const grade = gradeRaw === 'MGO' ? 'MGO' : 'VLSFO';

  if (!from || !to) {
    return NextResponse.json(
      { fallback: true, message: 'from and to required', port: null, priceUsdPerMt: null, recommendation: null, savingsUsd: 0 },
      { status: 400 },
    );
  }

  const directResult = getPortDistance(from, to);
  const directNm = directResult?.nm ?? null;

  const db = getStore().getDb();

  const onRouteWithPrices: Array<{ port: string; price: BunkerPrice }> = [];

  for (const candidate of BUNKER_CANDIDATES) {
    const priceRow = getLatestBunkerPrice(db, candidate, grade);
    if (!priceRow) continue;

    if (directNm != null) {
      const leg1 = getPortDistance(from, candidate);
      const leg2 = getPortDistance(candidate, to);
      if (leg1 && leg2) {
        const detour = leg1.nm + leg2.nm - directNm;
        const threshold = Math.max(DETOUR_RATIO * directNm, DETOUR_ABS_CAP_NM);
        if (detour > threshold) continue;
      }
      // If either leg distance is unknown, include the candidate (fail-open)
    }

    onRouteWithPrices.push({
      port: candidate,
      price: {
        port: candidate,
        vlsfo: priceRow.price_usd_per_mt,
        fetched_at: priceRow.fetched_at,
      },
    });
  }

  if (onRouteWithPrices.length === 0) {
    return NextResponse.json({
      fallback: true,
      message: 'No bunker port on this route — enter price manually or select nearest port',
      port: null,
      priceUsdPerMt: null,
      recommendation: null,
      savingsUsd: 0,
    });
  }

  const bunkerPrices = new Map<string, BunkerPrice>(
    onRouteWithPrices.map(({ port, price }) => [port, price]),
  );

  const result = optimizeSplitBunker({
    route: { fromPort: from, toPort: to, intermediatePorts: onRouteWithPrices.map(p => p.port) },
    bunkerPrices,
    consumptionMtPerDay: 28,
  });

  const recommendedPort = result.bunkerPlan[0]?.port ?? onRouteWithPrices[0].port;
  const recommendedPrice = bunkerPrices.get(recommendedPort);

  return NextResponse.json({
    fallback: false,
    message: null,
    port: recommendedPort,
    priceUsdPerMt: recommendedPrice?.vlsfo ?? null,
    recommendation: result.recommendation,
    savingsUsd: result.savingsUsd,
  });
}
