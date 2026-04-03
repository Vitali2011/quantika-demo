import { SessionData } from './types';
import { SESSION_TTL_MS } from './constants';
import { randomUUID } from 'crypto';

// Global in-memory session store
// Note: sessions are lost on process restart (acceptable for demo)
const sessions = new Map<string, SessionData>();

export function createSession(accessToken: string): string {
  const id = randomUUID();
  const session: SessionData = {
    id,
    accessToken,
    createdAt: new Date(),
    emails: [],
    classifications: [],
    parsedRequests: [],
    recaps: [],
  };
  sessions.set(id, session);

  // Auto-expire after TTL
  setTimeout(() => {
    sessions.delete(id);
  }, SESSION_TTL_MS);

  return id;
}

export function getSession(id: string): SessionData | null {
  const session = sessions.get(id);
  if (!session) return null;

  // Lazy expiration check
  const ageMs = Date.now() - session.createdAt.getTime();
  if (ageMs > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }

  return session;
}

export function updateSession(id: string, updates: Partial<SessionData>): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  Object.assign(session, updates);
  return true;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function getSessionCount(): number {
  return sessions.size;
}
