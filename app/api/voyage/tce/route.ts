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
import { resolvePort, type ResolvedPort } from '@/lib/ports/resolve';
import { getDistance } from '@/lib/knowledge/distances/lookup';
import { getStore } from '@/lib/session-store';

const LOCODE_RE = /^[A-Za-z]{5}$/;

/**
 * Resolve port input to a ResolvedPort.
 * - Known ports (name or LOCODE in our DB) → full resolve.
 * - Unknown LOCODE-format strings (5-char alpha) → synthetic pass-through for BC
 *   (preserves compatibility with callers using LOCODEs not yet in port-master.json).
 * - Unknown free-text names → null (caller should return 400).
 */
function resolvePortOrPassthrough(input: string): ResolvedPort | null {
  const resolved = resolvePort(input);
  if (resolved) return resolved;
  // BC: allow unknown 5-char LOCODE-format strings through as synthetic port
  if (LOCODE_RE.test(input)) {
    const code = input.toUpperCase();
    return { portCode: code, portName: code, country: '', lat: 0, lon: 0, aliases: [] };
  }
  return null;
}

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
    distanceNm: z.number().positive('distanceNm must be > 0').optional(),
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

function resolveDaUsd(
  body: z.infer<typeof VoyageInputSchema>,
  originResolved: ResolvedPort,
  destinationResolved: ResolvedPort,
): number {
  if (typeof body.daUsd === 'number') return body.daUsd;
  let total = 0;
  for (const port of [originResolved, destinationResolved]) {
    try {
      const da = getPortDa({
        portCode: port.portCode,
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

/**
 * Resolve distance from route input.
 * Priority:
 * 1. Explicit distanceNm in request → use it (user override)
 * 2. KNOWLEDGE_LAYER_DISTANCES_ENABLED=true → auto-resolve via getDistance()
 * 3. Otherwise → error (require explicit distanceNm)
 */
async function resolveDistanceNm(
  body: z.infer<typeof VoyageInputSchema>,
  originResolved: ResolvedPort,
  destinationResolved: ResolvedPort,
): Promise<{ distanceNm: number; error?: string }> {
  // User provided explicit distanceNm → use it
  if (typeof body.route.distanceNm === 'number') {
    return { distanceNm: body.route.distanceNm };
  }

  // Flag OFF → require explicit distanceNm
  const flagEnabled = process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED === 'true';
  if (!flagEnabled) {
    return { distanceNm: 0, error: 'distanceNm is required when KNOWLEDGE_LAYER_DISTANCES_ENABLED is not enabled' };
  }

  // Flag ON → auto-resolve via getDistance()
  try {
    const routeVia = body.route.viaSuez ? 'suez' : body.route.viaCanal ?? 'direct';
    const db = getStore().getDb();
    const result = await getDistance(
      db,
      originResolved.portCode,
      destinationResolved.portCode,
      routeVia,
    );
    return { distanceNm: result.distanceNm };
  } catch (err) {
    return {
      distanceNm: 0,
      error: `Cannot auto-resolve distance: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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

  // Resolve ports at API entry — single source of truth for downstream
  const originResolved = resolvePortOrPassthrough(data.route.originPort);
  if (!originResolved) {
    return NextResponse.json(
      { error: 'port_not_found', input: 'originPort', value: data.route.originPort },
      { status: 400 },
    );
  }
  const destinationResolved = resolvePortOrPassthrough(data.route.destinationPort);
  if (!destinationResolved) {
    return NextResponse.json(
      { error: 'port_not_found', input: 'destinationPort', value: data.route.destinationPort },
      { status: 400 },
    );
  }

  const canalUsd = resolveCanalUsd(data);
  const daUsd = resolveDaUsd(data, originResolved, destinationResolved);

  // Resolve distance (explicit or auto-resolve if flag enabled)
  const distanceResult = await resolveDistanceNm(data, originResolved, destinationResolved);
  if (distanceResult.error) {
    return NextResponse.json(
      { error: distanceResult.error },
      { status: 400 },
    );
  }

  const tceInput: VoyageInput = {
    vessel: {
      dwt: data.vessel.dwt,
      valueUsd: data.vessel.valueUsd,
      speedKts: data.vessel.speedKts,
      consumptionMtPerDay: data.vessel.consumptionMtPerDay,
    },
    route: {
      ...data.route,
      distanceNm: distanceResult.distanceNm,
      // Pass canonical port names downstream for war_risk matching
      originPort: originResolved.portName,
      destinationPort: destinationResolved.portName,
    },
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
