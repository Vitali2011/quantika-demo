import { NextRequest, NextResponse } from 'next/server';
import { SessionData } from './types';
import { getStore } from './session-store';

export function createSession(accessToken: string): string {
  return getStore().createSession(accessToken);
}

export function getSession(id: string): SessionData | null {
  return getStore().getSession(id);
}

export function updateSession(id: string, updates: Partial<SessionData>): boolean {
  return getStore().updateSession(id, updates);
}

export function deleteSession(id: string): void {
  getStore().deleteSession(id);
}

export function getSessionCount(): number {
  return getStore().getSessionCount();
}

export function requireSession(
  request: NextRequest,
): { session: SessionData; sessionId: string } | NextResponse {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  return { session, sessionId };
}
