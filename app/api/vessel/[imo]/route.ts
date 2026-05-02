import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupVesselByImo } from '@/lib/vessel/registry';

const ImoSchema = z.string().regex(/^\d{7}$/, 'IMO must be 7 digits');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imo: string }> },
) {
  const { imo } = await params;
  const parsed = ImoSchema.safeParse(imo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid IMO format — expected 7 digits' },
      { status: 400 },
    );
  }

  const vessel = await lookupVesselByImo(imo);
  if (!vessel) {
    return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
  }

  const reject = vessel.ciiRating === 'D' || vessel.ciiRating === 'E';

  return NextResponse.json({
    imo: vessel.imo,
    name: vessel.name,
    type: vessel.type,
    dwt: vessel.dwt,
    flag: vessel.flag,
    built_year: vessel.builtYear,
    cii_rating: vessel.ciiRating,
    chartering_policy_reject: reject,
    last_position: vessel.lastPosition,
  });
}
