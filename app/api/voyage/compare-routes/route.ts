/**
 * POST /api/voyage/compare-routes
 *
 * β-06 — Suez vs Cape side-by-side TCE comparison + LLM-explained recommendation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compareRoutes, type DaResolver } from '@/lib/economics/route-decision';
import { getPortDa } from '@/lib/port-da/repository';

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

  // wave-γ-4 (BUG-05): wire DA resolver from port_da_estimates so the TCE
  // breakdown surfaces real disbursement costs instead of hardcoded 0.
  // Resolver returns 0 for ports not in the dataset — calculator handles that.
  const daResolver: DaResolver = (portCode, vesselDwt) => {
    try {
      const da = getPortDa({ portCode, vesselDwt });
      return da?.totalFixedUsd ?? 0;
    } catch {
      // DB lookup failure must not break the comparison — degrade to 0.
      return 0;
    }
  };

  // βf3-06: timing markers for cold-start profiling
  console.time('cold:compare-routes-total');
  try {
    const result = await compareRoutes(
      body.origin,
      body.destination,
      body.vessel,
      body.cargo,
      body.marketRates,
      daResolver,
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
