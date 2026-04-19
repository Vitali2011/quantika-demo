import { NextResponse } from 'next/server';
import { getSessionCount } from '@/lib/session';

export const dynamic = 'force-dynamic';

const VERSION = '0.1.0';

/**
 * @public
 * Intentionally public endpoint — no auth, no CSRF, no session required.
 * Used by external uptime monitors (UptimeRobot, BetterStack) without cookies.
 * DO NOT add requireSession(), getSession(), or cookies.get('session_id') here.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sessions = getSessionCount();
    const uptime = Math.round(process.uptime() * 100) / 100;

    return NextResponse.json(
      { status: 'ok', sessions, uptime, version: VERSION },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
