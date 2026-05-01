import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getPortDa } from '@/lib/port-da/repository';

const PORT_CODE_RE = /^[A-Z]{5}$/;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ port_code: string }> },
): Promise<NextResponse> {
  const { port_code } = await context.params;

  if (!PORT_CODE_RE.test(port_code)) {
    return NextResponse.json(
      { error: 'Invalid port_code — must be exactly 5 uppercase letters' },
      { status: 400 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const dwtRaw = searchParams.get('vessel_dwt');

  if (!dwtRaw) {
    return NextResponse.json(
      { error: 'Missing required query parameter: vessel_dwt' },
      { status: 400 },
    );
  }

  const vesselDwt = Number(dwtRaw);
  if (!Number.isInteger(vesselDwt) || vesselDwt <= 0) {
    return NextResponse.json(
      { error: 'vessel_dwt must be a positive integer' },
      { status: 400 },
    );
  }

  const cargoType = searchParams.get('cargo_type') ?? undefined;

  const breakdown = getPortDa({ portCode: port_code, vesselDwt, cargoType });

  if (!breakdown) {
    return NextResponse.json(
      { error: 'No port DA data found for the given parameters' },
      { status: 404 },
    );
  }

  return NextResponse.json(breakdown, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
