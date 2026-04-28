import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { seedDemoForRegion } from '@/lib/onboarding/demo-seed';

type Region = 'MENA' | 'Med' | 'WAFR';
const VALID_REGIONS: Region[] = ['MENA', 'Med', 'WAFR'];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ region: string }> }
) {
  const { region } = await params;
  if (!VALID_REGIONS.includes(region as Region)) {
    return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  await seedDemoForRegion(sessionId, region as Region);
  return NextResponse.json({ ok: true, redirect: '/' });
}
