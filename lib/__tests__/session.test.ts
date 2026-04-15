import type { SessionData, Email } from '../types';
import { SESSION_TTL_MS } from '../constants';

type SessionMod = {
  createSession: (accessToken: string) => string;
  getSession: (id: string) => SessionData | null;
  updateSession: (id: string, updates: Partial<SessionData>) => boolean;
  deleteSession: (id: string) => void;
  getSessionCount: () => number;
};

describe('lib/session', () => {
  // Re-require the session module before each test to get a fresh in-memory Map.
  // lib/session.ts stores sessions in a module-level Map; jest.resetModules()
  // ensures each test starts with an empty store.
  let mod: SessionMod;

  beforeEach(() => {
    jest.resetModules();
    mod = jest.requireActual('../session') as SessionMod;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('create: returns a non-empty string ID', () => {
    const id = mod.createSession('access-token');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('get-hit: getSession returns session with correct fields after create', () => {
    const id = mod.createSession('my-token');
    const data = mod.getSession(id);
    expect(data).not.toBeNull();
    expect(data!.accessToken).toBe('my-token');
    expect(data!.id).toBe(id);
    expect(data!.createdAt).toBeInstanceOf(Date);
    expect(data!.emails).toEqual([]);
    expect(data!.classifications).toEqual([]);
    expect(data!.processedEmails).toEqual([]);
  });

  it('get-miss: returns null for nonexistent session ID', () => {
    expect(mod.getSession('no-such-id')).toBeNull();
  });

  it('get-expired: returns null after SESSION_TTL_MS elapses', () => {
    jest.useFakeTimers();
    const id = mod.createSession('expiring-token');
    jest.advanceTimersByTime(SESSION_TTL_MS + 1);
    expect(mod.getSession(id)).toBeNull();
  });

  it('update: updateSession persists partial update; getSession reflects change', () => {
    const id = mod.createSession('token');
    const mockEmail: Email = {
      id: 'email-1',
      threadId: 'thread-1',
      from: 'sender@example.com',
      fromName: 'Sender',
      fromEmail: 'sender@example.com',
      to: 'me@example.com',
      subject: 'Test Subject',
      date: '2024-01-01',
      body: 'Hello world',
      snippet: 'Hello',
      labelIds: [],
    };
    const ok = mod.updateSession(id, { emails: [mockEmail] });
    expect(ok).toBe(true);
    const updated = mod.getSession(id)!;
    expect(updated.emails).toHaveLength(1);
    expect(updated.emails[0].id).toBe('email-1');
  });

  it('expire-old: expired sessions are removed; getSessionCount returns 0', () => {
    jest.useFakeTimers();
    const id = mod.createSession('token');
    expect(mod.getSessionCount()).toBe(1);
    jest.advanceTimersByTime(SESSION_TTL_MS + 1);
    // getSession removes the expired entry from the Map on access
    expect(mod.getSession(id)).toBeNull();
    expect(mod.getSessionCount()).toBe(0);
  });

  it('delete: deleteSession removes session; subsequent getSession returns null', () => {
    const id = mod.createSession('token');
    expect(mod.getSession(id)).not.toBeNull();
    mod.deleteSession(id);
    expect(mod.getSession(id)).toBeNull();
  });

  it('create: all collection fields initialised to empty arrays, commissionSummary null', () => {
    const id = mod.createSession('tok');
    const data = mod.getSession(id)!;
    expect(data.emails).toEqual([]);
    expect(data.classifications).toEqual([]);
    expect(data.processedEmails).toEqual([]);
    expect(data.parsedCargos).toEqual([]);
    expect(data.parsedVessels).toEqual([]);
    expect(data.parsedFixtureRecaps).toEqual([]);
    expect(data.matches).toEqual([]);
    expect(data.recaps).toEqual([]);
    expect(data.commissionSummary).toBeNull();
    expect(data.counterparties).toEqual([]);
  });
});
