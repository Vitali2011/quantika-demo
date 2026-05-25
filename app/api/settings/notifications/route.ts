import { NextRequest, NextResponse } from 'next/server';

const VALID_PREF_KEYS = new Set(['new_match', 'email_digest', 'urgent_action', 'weekly_report']);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { preferences } = body as Record<string, unknown>;

  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return NextResponse.json({ error: 'preferences must be an object' }, { status: 400 });
  }

  for (const [key, value] of Object.entries(preferences)) {
    if (!VALID_PREF_KEYS.has(key)) {
      return NextResponse.json({ error: `Unknown preference key: ${key}` }, { status: 400 });
    }
    if (typeof value !== 'boolean') {
      return NextResponse.json({ error: `Preference value for ${key} must be boolean` }, { status: 400 });
    }
  }

  return NextResponse.json({ saved: true, preferences });
}
