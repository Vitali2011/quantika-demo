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
import { resolveVaguePort } from '@/lib/ports/resolve-vague';
import { getDistance } from '@/lib/knowledge/distances/lookup';
import { getStore } from '@/lib/session-store';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { isEuCountry } from '@/lib/validation/sanctions';
import { routeTransitsBosporus, quoteBosporusSafe, routeTransitsSuez, quoteSuezSafe } from '@/lib/matching/tce-calculator';

const LOCODE_RE = /^[A-Za-z]{5}$/;

/**
 * Resolve port input to a ResolvedPort.
 * - Known ports (name or LOCODE in our DB) → full resolve.
 * - Unknown LOCODE-format strings (5-char alpha) → synthetic pass-through for BC
 *   (preserves compatibility with callers using LOCODEs not yet in port-master.json).
 * - Vague descriptors ("East Coast Greece port (unspecified)") → representative
 *   basin port with approximate=true (Variant A) so P&L computes instead of a red
 *   port_not_found; UI shows an amber "approximate port" note.
 * - Genuinely-unknown free-text names → null (caller should return 400).
 */
function resolvePortOrPassthrough(input: string): { port: ResolvedPort; approximate: boolean } | null {
  const resolved = resolvePort(input);
  if (resolved) return { port: resolved, approximate: false };
  // BC: allow unknown 5-char LOCODE-format strings through as synthetic port
  if (LOCODE_RE.test(input)) {
    const code = input.toUpperCase();
    return { port: { portCode: code, portName: code, country: '', lat: 0, lon: 0, aliases: [] }, approximate: false };
  }
  // Variant A: vague descriptor → representative basin port (approximate).
  const vague = resolveVaguePort(input);
  if (vague) return { port: vague, approximate: true };
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
    /** Open position for ballast-leg canal detection. Optional — absent means no ballast canal. */
    openPosition: z.string().optional(),
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
  bunkerPriceUsdPerMt: z.number().optional(),
  euaPriceEur: z.number().optional(),
  durationDays: z.number(),
  euLegPercent: z.number().optional(),
  daysInHra: z.number().optional(),
  canalUsd: z.number().optional(),
  daUsd: z.number().optional(),
  cargoType: z.string().optional(),
  bunkerPort: z.string().regex(/^[A-Z]{5}$/i).optional(),
  bunkerGrade: z.enum(['VLSFO', 'MGO']).optional(),
  includeEuETS: z.boolean().optional(),
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
    // L-8: log server-side, return a generic message (no raw error leak).
    console.error('[voyage/tce] distance auto-resolve failed:', err);
    return {
      distanceNm: 0,
      error: 'Cannot auto-resolve distance',
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
  const originR = resolvePortOrPassthrough(data.route.originPort);
  if (!originR) {
    return NextResponse.json(
      { error: 'port_not_found', input: 'originPort', value: data.route.originPort },
      { status: 400 },
    );
  }
  const originResolved = originR.port;
  const destinationR = resolvePortOrPassthrough(data.route.destinationPort);
  if (!destinationR) {
    return NextResponse.json(
      { error: 'port_not_found', input: 'destinationPort', value: data.route.destinationPort },
      { status: 400 },
    );
  }
  const destinationResolved = destinationR.port;

  // Variant A: vague descriptors resolved to a representative port — surface so
  // the UI can flag the route as approximate (amber "confirm port") rather than
  // presenting an approximate distance/P&L as exact.
  const approximatePorts: Array<{ side: 'origin' | 'destination'; input: string; resolvedTo: string }> = [];
  if (originR.approximate) {
    approximatePorts.push({ side: 'origin', input: data.route.originPort, resolvedTo: originResolved.portName });
  }
  if (destinationR.approximate) {
    approximatePorts.push({ side: 'destination', input: data.route.destinationPort, resolvedTo: destinationResolved.portName });
  }

  let canalUsd = resolveCanalUsd(data);
  // Auto-derive Bosporus dues when body.canalUsd is absent (parity with stored match path).
  // Suez is left to explicit body.canalUsd / viaSuez to avoid double-charge on existing callers.
  if (typeof data.canalUsd !== 'number' && !data.route.viaSuez && !data.route.viaCanal) {
    if (routeTransitsBosporus(originResolved.portName, destinationResolved.portName)) {
      canalUsd += quoteBosporusSafe(data.vessel.dwt);
    }
    if (routeTransitsSuez(originResolved.portName, destinationResolved.portName)) {
      canalUsd += quoteSuezSafe(data.vessel.dwt, true);
    }
    // Ballast leg canal: open position → load port (parity with stored-match path).
    const openPosition = data.vessel.openPosition;
    if (openPosition) {
      const openR = resolvePortOrPassthrough(openPosition);
      const openName = openR?.port.portName ?? openPosition;
      if (routeTransitsBosporus(openName, originResolved.portName)) {
        canalUsd += quoteBosporusSafe(data.vessel.dwt);
      }
      if (routeTransitsSuez(openName, originResolved.portName)) {
        canalUsd += quoteSuezSafe(data.vessel.dwt, false); // ballast = unladen
      }
    }
  }
  const daUsd = resolveDaUsd(data, originResolved, destinationResolved);

  // Resolve distance (explicit or auto-resolve if flag enabled)
  const distanceResult = await resolveDistanceNm(data, originResolved, destinationResolved);
  if (distanceResult.error) {
    return NextResponse.json(
      { error: distanceResult.error },
      { status: 400 },
    );
  }

  // ── Bunker price resolution ──
  let bunkerPriceUsdPerMt: number;
  // bunker always has a DB row or returns 422 — no auto-skip or auto-fallback path
  let bunkerPriceSource: {
    value: number; source: string; priceDate?: string; fetchedAt?: string; mode: 'manual' | 'auto';
  };
  if (typeof data.bunkerPriceUsdPerMt === 'number') {
    bunkerPriceUsdPerMt = data.bunkerPriceUsdPerMt;
    bunkerPriceSource = { value: data.bunkerPriceUsdPerMt, source: 'manual', mode: 'manual' };
  } else {
    if (!data.bunkerPort) {
      return NextResponse.json({ error: 'bunker_port_required' }, { status: 400 });
    }
    const port = data.bunkerPort.toUpperCase();
    const grade = data.bunkerGrade ?? 'VLSFO';
    const db = getStore().getDb();
    const row = getLatestBunkerPrice(db, port, grade);
    if (!row) {
      return NextResponse.json(
        { error: { code: 'bunker_price_unavailable', details: { port, grade } } },
        { status: 422 },
      );
    }
    bunkerPriceUsdPerMt = row.price_usd_per_mt;
    bunkerPriceSource = {
      value: row.price_usd_per_mt, source: row.source,
      priceDate: row.price_date, fetchedAt: row.fetched_at, mode: 'auto',
    };
  }

  // ── EUA price resolution ──
  let euaPriceEur: number;
  let euaPriceSource: {
    value: number; source: string; priceDate?: string; fetchedAt?: string; mode: 'manual' | 'auto' | 'auto-skip' | 'auto-fallback';
  };
  if (typeof data.euaPriceEur === 'number') {
    euaPriceEur = data.euaPriceEur;
    euaPriceSource = { value: data.euaPriceEur, source: 'manual', mode: 'manual' };
  } else {
    const euTrigger = data.includeEuETS === true
      || isEuCountry(originResolved.country)
      || isEuCountry(destinationResolved.country);
    if (!euTrigger) {
      euaPriceEur = 0;
      euaPriceSource = { value: 0, source: 'not-applicable', mode: 'auto-skip' };
    } else {
      const db = getStore().getDb();
      const row = getLatestEuaPrice(db, 'spot');
      if (!row) {
        euaPriceEur = 0;
        euaPriceSource = { value: 0, source: 'unavailable', mode: 'auto-fallback' };
      } else {
        euaPriceEur = row.price_eur_per_tco2;
        euaPriceSource = {
          value: row.price_eur_per_tco2, source: row.source,
          priceDate: row.price_date, fetchedAt: row.fetched_at, mode: 'auto',
        };
      }
    }
  }

  // ── EU endpoint flags (for ETS coverage factor) ─────────────────────────────
  const originEu = isEuCountry(originResolved.country);
  const destEu = isEuCountry(destinationResolved.country);

  // ── ETS euLegPercent auto-derive ──
  let resolvedEuLegPercent = data.euLegPercent;
  let etsMode: 'auto-derived' | 'manual' | 'not-applicable' = 'not-applicable';
  let etsReason = 'not-applicable';

  if (data.includeEuETS && euaPriceEur > 0) {
    if (resolvedEuLegPercent !== undefined) {
      etsMode = 'manual';
      etsReason = 'caller-provided';
    } else {
      if (originEu && destEu) {
        resolvedEuLegPercent = 1.0;
        etsMode = 'auto-derived';
        etsReason = 'both legs EU (intra-EU voyage)';
      } else if (originEu || destEu) {
        resolvedEuLegPercent = 1.0;
        etsMode = 'auto-derived';
        etsReason = 'one leg EU — 50% regulatory coverage factor applied';
      } else {
        etsMode = 'not-applicable';
        etsReason = 'no EU leg';
      }
    }
  }

  const etsResolution = {
    euLegPercent: resolvedEuLegPercent,
    mode: etsMode,
    reason: etsReason,
  };

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
    bunkerPriceUsdPerMt,
    euaPriceEur,
    durationDays: data.durationDays,
    euLegPercent: resolvedEuLegPercent,
    originEu: data.includeEuETS ? originEu : undefined,
    destEu: data.includeEuETS ? destEu : undefined,
    daysInHra: data.daysInHra,
    canalUsd,
    daUsd,
    excludeWarRiskFromDailyTce: true,
  };

  const result = calculateTCE(tceInput);
  return NextResponse.json({
    ...result,
    bunkerPriceSource,
    euaPriceSource,
    etsResolution,
    ...(approximatePorts.length > 0 ? { approximatePorts } : {}),
  });
}
