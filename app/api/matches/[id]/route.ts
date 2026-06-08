import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import {
  getMatch,
  getMatchBySlug,
  updateMatchStatus,
  updateMatchFreightRate,
} from '@/lib/matching/matches-repository';
import { fromMatchSlug } from '@/lib/matching/match-slug';
import type { MatchStatus } from '@/lib/matching/matches-repository';
import type { FreightRateSource } from '@/lib/matching/tce-calculator';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import type { StoredMatch } from '@/lib/matching/matches-repository';

export const dynamic = 'force-dynamic';

function buildCargoProxy(m: StoredMatch): ParsedCargo {
  const cf = <T>(v: T | null) => (v != null ? { value: v, confidence: 'interpreted' as const } : null);
  return {
    emailId: m.cargo_id,
    itemIndex: m.cargo_item_index ?? 0,
    originPort: cf(m.load_port),
    destinationPort: cf(m.discharge_port),
    cargoType: (m.cargo_type ?? null) as unknown as 'BULK',
    cargoDescription: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    freightRateUsd: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    originCountry: null,
    destinationCountry: null,
  };
}

function buildVesselProxy(m: StoredMatch): ParsedVessel {
  const cf = <T>(v: T | null) => (v != null ? { value: v, confidence: 'interpreted' as const } : null);
  return {
    emailId: m.vessel_id,
    itemIndex: m.vessel_item_index ?? 0,
    vesselName: cf(m.vessel_name),
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: cf(m.vessel_dwt),
    dwcc: null,
    draftMax: null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: null,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: null,
    craneCapacity: null,
    hatchType: null,
    vesselType: null,
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
  };
}

const VALID_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];

function isFeatureEnabled(): boolean {
  return process.env.MATCHES_ENABLED === 'true';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 503 });
  }

  try {
    const { id: idStr } = await context.params;
    const db = getStore().getDatabase();

    let match;
    if (/^\d+$/.test(idStr)) {
      const numId = parseInt(idStr, 10);
      if (numId < 1) {
        return NextResponse.json({ error: 'Invalid match id' }, { status: 400 });
      }
      match = getMatch(db, numId);
    } else {
      const keys = fromMatchSlug(idStr);
      if (!keys) {
        return NextResponse.json({ error: 'Invalid match id' }, { status: 400 });
      }
      match = getMatchBySlug(db, keys.cargo_id, keys.vessel_id, sessionId);
    }

    // Return 404 for both missing matches and matches owned by other sessions
    if (!match || match.user_id !== sessionId) {
      return NextResponse.json({ error: `Match not found: ${idStr}` }, { status: 404 });
    }

    return NextResponse.json(match, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const { id: idStr } = await context.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json(
        { error: 'Invalid match id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, freight_rate_usd_per_mt, reset_freight_rate } = body;

    const db = getStore().getDatabase();
    const existing = getMatch(db, id);

    if (!existing || existing.user_id !== sessionId) {
      return NextResponse.json(
        { error: `Match not found: ${id}` },
        { status: 404 }
      );
    }

    // Reset-to-auto path: clear a sticky manual override and recompute via the
    // canonical economics path (port distance, DA, canal, ETS, excludeWarRisk).
    // Proxy cargo/vessel from stored columns — no freightOverrideUsdPerMt so
    // resolveFreightRate falls through to estimated/baltic tier naturally.
    if (reset_freight_rate === true) {
      const eco = computeStoredMatchEconomics({
        cargo: buildCargoProxy(existing),
        vessel: buildVesselProxy(existing),
        db,
      });
      const rate = eco.freight_rate_usd_per_mt ?? existing.freight_rate_usd_per_mt ?? 0;
      const tce = eco.tce_usd_per_day ?? existing.tce_usd_per_day ?? 0;
      const source = (eco.freight_rate_source ?? 'estimated') as FreightRateSource;
      const updated = updateMatchFreightRate(db, id, rate, tce, source);
      return NextResponse.json(updated, { status: 200 });
    }

    // Freight rate override path
    if (freight_rate_usd_per_mt !== undefined) {
      const rate = Number(freight_rate_usd_per_mt);
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json(
          { error: 'freight_rate_usd_per_mt must be a positive number' },
          { status: 400 }
        );
      }
      const eco = computeStoredMatchEconomics({
        cargo: buildCargoProxy(existing),
        vessel: buildVesselProxy(existing),
        db,
        freightOverrideUsdPerMt: rate,
      });
      const tce = eco.tce_usd_per_day ?? existing.tce_usd_per_day ?? 0;
      const updated = updateMatchFreightRate(db, id, rate, tce, 'manual');
      return NextResponse.json(updated, { status: 200 });
    }

    // Status update path
    if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status as MatchStatus)) {
      return NextResponse.json(
        { error: 'Field "status" is required and must be one of: shortlist, saved, dismissed, archived' },
        { status: 400 }
      );
    }

    const updated = updateMatchStatus(db, id, status as MatchStatus);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof Error && /Invalid transition/i.test(error.message)) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
