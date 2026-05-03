/**
 * POST /api/voyage/compare-routes
 *
 * β-06 — Suez vs Cape side-by-side TCE comparison + LLM-explained recommendation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compareRoutes } from '@/lib/economics/route-decision';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  vessel: z.object({
    dwt: z.number(),
    valueUsd: z.number(),
    speedKts: z.number(),
    consumptionMtPerDay: z.number(),
  }),
  cargo: z.object({
    quantityMt: z.number(),
    freightRateUsdPerMt: z.number(),
  }),
  marketRates: z.object({
    bunkerPriceUsdPerMt: z.number(),
    euaPriceEur: z.number(),
  }),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request body', details: String(err) },
      { status: 400 },
    );
  }

  // βf3-06: timing markers for cold-start profiling
  console.time('cold:compare-routes-total');
  try {
    const result = await compareRoutes(
      body.origin,
      body.destination,
      body.vessel,
      body.cargo,
      body.marketRates,
    );
    console.timeEnd('cold:compare-routes-total');
    return NextResponse.json(result);
  } catch (err) {
    console.timeEnd('cold:compare-routes-total');
    return NextResponse.json(
      { error: 'compare-routes failed', details: String(err) },
      { status: 500 },
    );
  }
}
