import type { Email, SessionData } from '../types';
import { createSession, deleteSession, getSession, updateSession } from '../session';

// Uses the in-memory SQLite DB configured by jest.setup.ts (SESSIONS_DB_PATH=':memory:').
// Each test cleans up its own sessions in afterEach — no fake timers, no TTL tests
// (those live in session-expiry.test.ts, spec-05).

describe('lib/session – CRUD', () => {
  const createdIds: string[] = [];

  function create(token = 'test-token'): string {
    const id = createSession(token);
    createdIds.push(id);
    return id;
  }

  afterEach(() => {
    for (const id of createdIds) {
      deleteSession(id);
    }
    createdIds.length = 0;
  });

  it('createSession returns a non-empty string ID', () => {
    const id = create();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('getSession returns SessionData with empty arrays after createSession', () => {
    const id = create('my-token');
    const data = getSession(id);
    expect(data).not.toBeNull();
    expect(data!.id).toBe(id);
    expect(data!.accessToken).toBe('my-token');
    expect(data!.createdAt).toBeInstanceOf(Date);
    expect(data!.emails).toEqual([]);
    expect(data!.parsedCargos).toEqual([]);
    expect(data!.matches).toEqual([]);
    expect(data!.recaps).toEqual([]);
    expect(data!.commissionSummary).toBeNull();
  });

  it('getSession returns null for unknown id', () => {
    expect(getSession('no-such-id-xyz')).toBeNull();
  });

  it('updateSession returns true and persists partial update', () => {
    const id = create();
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
    const ok = updateSession(id, { emails: [mockEmail] });
    expect(ok).toBe(true);
    const updated = getSession(id) as SessionData;
    expect(updated.emails).toHaveLength(1);
    expect(updated.emails[0].id).toBe('email-1');
  });

  it('updateSession returns false for unknown id', () => {
    expect(updateSession('no-such-id-xyz', {})).toBe(false);
  });

  it('deleteSession removes session; subsequent getSession returns null', () => {
    // Create without registering for afterEach — we delete manually below
    const id = createSession('delete-me');
    expect(getSession(id)).not.toBeNull();
    deleteSession(id);
    expect(getSession(id)).toBeNull();
  });
});
