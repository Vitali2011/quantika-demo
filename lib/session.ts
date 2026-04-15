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
