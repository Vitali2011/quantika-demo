import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  SessionStore,
  MAX_SESSIONS,
} from '../session-store';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-store-test-'));
  dbPath = path.join(tmpDir, 'sessions.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createSession', () => {
  it('returns a UUID string', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-123');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('persists the session so getSession returns it', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-abc');
    const session = store.getSession(id);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(id);
    expect(session!.accessToken).toBe('tok-abc');
  });

  it('initialises empty arrays and null fields', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-xyz');
    const session = store.getSession(id);
    expect(session!.emails).toEqual([]);
    expect(session!.classifications).toEqual([]);
    expect(session!.commissionSummary).toBeNull();
  });

  it('createdAt is a Date instance', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-date');
    const session = store.getSession(id);
    expect(session!.createdAt).toBeInstanceOf(Date);
  });
});

describe('getSession', () => {
  it('returns null for unknown id', () => {
    const store = new SessionStore(dbPath);
    expect(store.getSession('nonexistent')).toBeNull();
  });

  it('returns null for expired session', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-exp');

    // Move Date.now into the future beyond TTL
    const realNow = Date.now;
    const ttlMs = 60 * 60 * 1000;
    Date.now = () => realNow() + ttlMs + 1000;

    try {
      expect(store.getSession(id)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('updateSession', () => {
  it('returns true and updates fields', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-upd');
    const ok = store.updateSession(id, { emails: [{ id: 'e1' } as never] });
    expect(ok).toBe(true);
    const session = store.getSession(id);
    expect(session!.emails).toHaveLength(1);
  });

  it('returns false for unknown id', () => {
    const store = new SessionStore(dbPath);
    expect(store.updateSession('ghost', { emails: [] })).toBe(false);
  });
});

describe('deleteSession', () => {
  it('removes session from store', () => {
    const store = new SessionStore(dbPath);
    const id = store.createSession('tok-del');
    store.deleteSession(id);
    expect(store.getSession(id)).toBeNull();
  });
});

describe('expireOldSessions', () => {
  it('removes sessions past their TTL', () => {
    const store = new SessionStore(dbPath);
    const id1 = store.createSession('tok-1');
    const id2 = store.createSession('tok-2');

    const realNow = Date.now;
    const ttlMs = 60 * 60 * 1000;
    Date.now = () => realNow() + ttlMs + 1000;

    store.expireOldSessions();
    Date.now = realNow;

    expect(store.getSession(id1)).toBeNull();
    expect(store.getSession(id2)).toBeNull();
    expect(store.getSessionCount()).toBe(0);
  });
});

describe('getSessionCount', () => {
  it('reflects actual number of live sessions', () => {
    const store = new SessionStore(dbPath);
    expect(store.getSessionCount()).toBe(0);
    store.createSession('tok-a');
    store.createSession('tok-b');
    expect(store.getSessionCount()).toBe(2);
  });
});

describe('MAX_SESSIONS eviction', () => {
  it(`evicts oldest when count would exceed MAX_SESSIONS (${MAX_SESSIONS})`, () => {
    const store = new SessionStore(dbPath);

    // Fill to the limit
    const ids: string[] = [];
    for (let i = 0; i < MAX_SESSIONS; i++) {
      ids.push(store.createSession(`tok-${i}`));
    }
    expect(store.getSessionCount()).toBe(MAX_SESSIONS);

    // The first session is the oldest
    const oldest = ids[0];
    expect(store.getSession(oldest)).not.toBeNull();

    // Adding one more should evict the oldest
    store.createSession('tok-overflow');
    expect(store.getSessionCount()).toBe(MAX_SESSIONS);
    expect(store.getSession(oldest)).toBeNull();
  });
});

describe('persistence across restart', () => {
  it('survives re-opening the database file', () => {
    // Step 1: write in first instance
    const store1 = new SessionStore(dbPath);
    const id = store1.createSession('tok-persist');
    store1.updateSession(id, { emails: [{ id: 'email-1' } as never] });

    // Step 2: open fresh instance against same file
    const store2 = new SessionStore(dbPath);
    const session = store2.getSession(id);

    expect(session).not.toBeNull();
    expect(session!.id).toBe(id);
    expect(session!.accessToken).toBe('tok-persist');
    expect(session!.emails).toHaveLength(1);
  });
});
