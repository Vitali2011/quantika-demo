/**
 * POST /api/voyage/tce
 *
 * Aggregates voyage costs into a daily TCE breakdown. Optionally resolves
 * canal/DA dues via existing modules; otherwise falls back to caller-provided
 * `canalUsd` / `daUsd` values from the request body.
 *
 * SLA target: < 3s (no remote network calls when canal/DA pre-resolved).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateTCE, type VoyageInput } from '@/lib/economics/voyage-calculator';
import { quoteCanal, type CanalCode, type SuezInput, type CanalInput } from '@/lib/economics/canals/index';
import { getPortDa } from '@/lib/port-da/repository';

export const dynamic = 'force-dynamic';

const VoyageInputSchema = z.object({
  vessel: z.object({
    dwt: z.number(),
    valueUsd: z.number(),
    speedKts: z.number(),
    consumptionMtPerDay: z.number(),
    nt: z.number().optional(),
    type: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
        z.enum(['bulker', 'tanker', 'container', 'general', 'mpp']),
      )
      .optional(),
  }),
  route: z.object({
    originPort: z.string(),
    destinationPort: z.string(),
    distanceNm: z.number().positive('distanceNm must be > 0'),
    viaSuez: z.boolean().optional(),
    viaCanal: z.string().optional(),
  }),
  cargo: z.object({
    quantityMt: z.number(),
    freightRateUsdPerMt: z.number(),
  }),
  bunkerPriceUsdPerMt: z.number(),
  euaPriceEur: z.number(),
  durationDays: z.number(),
  euLegPercent: z.number().optional(),
  daysInHra: z.number().optional(),
  canalUsd: z.number().optional(),
  daUsd: z.number().optional(),
  cargoType: z.string().optional(),
});

function resolveCanalUsd(body: z.infer<typeof VoyageInputSchema>): number {
  if (typeof body.canalUsd === 'number') return body.canalUsd;
  const code: CanalCode | null = body.route.viaSuez
    ? 'suez'
    : (body.route.viaCanal as CanalCode | undefined) ?? null;
  if (!code) return 0;
  // βf-05: 'mpp' is accepted at the API boundary but canal tariff tables only
  // carry 'bulker' | 'tanker' | 'container' | 'general' rows. Fall back to
  // 'general' semantics for canal pricing — MPP vessels are most similar to
  // general-cargo for SCNT/dues purposes.
  const rawType = body.vessel.type ?? 'bulker';
  const vesselType = rawType === 'mpp' ? 'general' : rawType;
  const vesselNt = body.vessel.nt ?? Math.round(body.vessel.dwt * 0.6);
  try {
    if (code === 'suez') {
      const input: SuezInput = {
        vesselDwt: body.vessel.dwt,
        vesselNt,
        vesselType,
        laden: true,
      };
      return quoteCanal('suez', input).totalUsd;
    }
    const input: CanalInput = { vesselDwt: body.vessel.dwt, vesselNt, vesselType };
    return quoteCanal(code, input).totalUsd;
  } catch {
    return 0;
  }
}

function resolveDaUsd(body: z.infer<typeof VoyageInputSchema>): number {
  if (typeof body.daUsd === 'number') return body.daUsd;
  let total = 0;
  for (const port of [body.route.originPort, body.route.destinationPort]) {
    try {
      const da = getPortDa({
        portCode: port,
        vesselDwt: body.vessel.dwt,
        cargoType: body.cargoType,
      });
      if (da) total += da.totalFixedUsd;
    } catch {
      // skip — fall through to 0 contribution
    }
  }
  return total;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = VoyageInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const canalUsd = resolveCanalUsd(data);
  const daUsd = resolveDaUsd(data);

  const tceInput: VoyageInput = {
    vessel: {
      dwt: data.vessel.dwt,
      valueUsd: data.vessel.valueUsd,
      speedKts: data.vessel.speedKts,
      consumptionMtPerDay: data.vessel.consumptionMtPerDay,
    },
    route: data.route,
    cargo: data.cargo,
    bunkerPriceUsdPerMt: data.bunkerPriceUsdPerMt,
    euaPriceEur: data.euaPriceEur,
    durationDays: data.durationDays,
    euLegPercent: data.euLegPercent,
    daysInHra: data.daysInHra,
    canalUsd,
    daUsd,
  };

  const result = calculateTCE(tceInput);
  return NextResponse.json(result);
}
