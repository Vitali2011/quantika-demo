import { NextResponse, type NextRequest } from 'next/server';
import type Database from 'better-sqlite3';
import { getAuthConfig } from '@/lib/auth/config';
import { verifyAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getStore } from '@/lib/session-store';

const VALID_MODES = ['charterer', 'owner'] as const;
type Mode = (typeof VALID_MODES)[number];

async function resolveUsername(req: NextRequest): Promise<string | null> {
  const authConfig = getAuthConfig();
  if (!authConfig.enabled) return 'demo';
  if (!authConfig.secret) return null;
  const cookieValue = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  const payload = await verifyAuthCookie(cookieValue, authConfig.secret);
  return payload?.user ?? null;
}

function getOrInitMode(db: Database.Database, username: string): Mode {
  const row = db
    .prepare<[string], { preferred_mode: Mode }>('SELECT preferred_mode FROM user_preferences WHERE username = ?')
    .get(username);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO user_preferences (username) VALUES (?)').run(username);
    return 'charterer';
  }
  return row.preferred_mode;
}

export async function GET(req: NextRequest) {
  const username = await resolveUsername(req);
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getStore().getDatabase();
  const preferred_mode = getOrInitMode(db, username);
  return NextResponse.json({ id: username, email: username, preferred_mode });
}

export async function PATCH(req: NextRequest) {
  const username = await resolveUsername(req);
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = body.preferred_mode;
  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as Mode)) {
    return NextResponse.json({ error: 'invalid preferred_mode' }, { status: 400 });
  }
  const db = getStore().getDatabase();
  db.prepare('INSERT OR REPLACE INTO user_preferences (username, preferred_mode) VALUES (?, ?)').run(username, mode);
  return NextResponse.json({ id: username, email: username, preferred_mode: mode as Mode });
}
