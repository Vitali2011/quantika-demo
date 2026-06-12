import { NextRequest, NextResponse } from 'next/server';
import { quoteCanal } from '@/lib/economics/canals/index';
import type { CanalCode, SuezInput, CanalInput } from '@/lib/economics/canals/index';
import { NT_DWT_RATIO } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const VALID_CANAL_CODES: readonly CanalCode[] = ['suez', 'panama', 'kiel', 'bosporus'];
const VALID_VESSEL_TYPES = ['bulker', 'tanker', 'container', 'general'] as const;
type VesselType = typeof VALID_VESSEL_TYPES[number];

function parsePositiveFinite(value: string | null, fieldName: string): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ canal_code: string }> }
): Promise<NextResponse> {
  const { canal_code } = await context.params;

  if (!VALID_CANAL_CODES.includes(canal_code as CanalCode)) {
    return NextResponse.json(
      { error: `Unknown canal code: ${canal_code}. Valid codes: ${VALID_CANAL_CODES.join(', ')}` },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const rawDwt = sp.get('vessel_dwt');
  const rawNt  = sp.get('vessel_nt');
  const rawType = sp.get('vessel_type');
  const rawLaden = sp.get('laden');

  if (!rawDwt) {
    return NextResponse.json({ error: 'Missing required parameter: vessel_dwt' }, { status: 400 });
  }

  const vesselDwt = parsePositiveFinite(rawDwt, 'vessel_dwt');
  if (vesselDwt === null) {
    return NextResponse.json(
      { error: 'vessel_dwt must be a finite positive number' },
      { status: 400 }
    );
  }

  if (!rawType || !VALID_VESSEL_TYPES.includes(rawType as VesselType)) {
    return NextResponse.json(
      { error: `vessel_type must be one of: ${VALID_VESSEL_TYPES.join(', ')}` },
      { status: 400 }
    );
  }
  const vesselType = rawType as VesselType;

  // Suez requires vessel_nt
  if (canal_code === 'suez') {
    if (!rawNt) {
      return NextResponse.json({ error: 'vessel_nt is required for suez' }, { status: 400 });
    }
    const vesselNt = parsePositiveFinite(rawNt, 'vessel_nt');
    if (vesselNt === null) {
      return NextResponse.json(
        { error: 'vessel_nt must be a finite positive number' },
        { status: 400 }
      );
    }
    const laden = rawLaden !== 'false';
    const suezInput: SuezInput = { vesselDwt, vesselNt, vesselType, laden };
    try {
      const result = quoteCanal('suez', suezInput);
      return NextResponse.json(result);
    } catch (err) {
      // L-8: log server-side, return generic message.
      console.error('[canal] quoteCanal failed:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }

  // Non-Suez canals: vessel_nt optional (defaults to vesselDwt × 0.65, canonical NT_DWT_RATIO)
  const vesselNt = rawNt
    ? (parsePositiveFinite(rawNt, 'vessel_nt') ?? Math.round(vesselDwt * NT_DWT_RATIO))
    : Math.round(vesselDwt * NT_DWT_RATIO);

  const input: CanalInput = { vesselDwt, vesselNt, vesselType };
  try {
    const result = quoteCanal(canal_code as CanalCode, input);
    return NextResponse.json(result);
  } catch (err) {
    // L-8: log server-side, return generic message.
    console.error('[canal] quoteCanal failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
