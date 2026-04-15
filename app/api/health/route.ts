import { NextResponse } from 'next/server';

import { getSessionCount } from '@/lib/session';

export const dynamic = 'force-dynamic';

const VERSION = '0.1.0';

export async function GET() {
  try {
    const sessions = getSessionCount();
    const uptime = Math.round(process.uptime() * 100) / 100;

    return NextResponse.json(
      { status: 'ok', sessions, uptime, version: VERSION },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
