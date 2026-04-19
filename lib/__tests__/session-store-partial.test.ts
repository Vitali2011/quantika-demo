/**
 * Partial-write test: SessionStore.updateSessionField.
 * Verifies that updateSessionField updates exactly the specified field
 * without touching others, and does NOT delegate to the full-blob updateSession path.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStore } from '../session-store';
import type { ParsedCargo } from '../types';

let tmpDir: string;
let dbPath: string;
let store: SessionStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-store-partial-'));
  dbPath = path.join(tmpDir, 'sessions.db');
  store = new SessionStore(dbPath);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('updateSessionField', () => {
  it('is a method on SessionStore', () => {
    expect(typeof store.updateSessionField).toBe('function');
  });

  it('updates only the specified field, leaving others unchanged', () => {
    const id = store.createSession('tok-partial');
    const before = store.getSession(id)!;
    expect(before.parsedCargos).toEqual([]);

    const fakeCargo = [{ emailId: 'e1', itemIndex: 0 }] as unknown as ParsedCargo[];
    store.updateSessionField(id, 'parsedCargos', fakeCargo);

    const after = store.getSession(id)!;
    expect(after.parsedCargos).toEqual(fakeCargo);
    // other fields untouched
    expect(after.emails).toEqual(before.emails);
    expect(after.classifications).toEqual(before.classifications);
    expect(after.parsedVessels).toEqual(before.parsedVessels);
    expect(after.accessToken).toBe(before.accessToken);
  });

  it('does NOT call full-blob updateSession internally', () => {
    const id = store.createSession('tok-spy');
    const updateSessionSpy = jest.spyOn(store, 'updateSession');

    store.updateSessionField(id, 'parsedVessels', []);

    expect(updateSessionSpy).not.toHaveBeenCalled();
    updateSessionSpy.mockRestore();
  });

  it('returns true on success and false for unknown session', () => {
    const id = store.createSession('tok-ret');
    const ok = store.updateSessionField(id, 'matches', []);
    expect(ok).toBe(true);

    const miss = store.updateSessionField('no-such-id', 'matches', []);
    expect(miss).toBe(false);
  });

  it('handles parsedFixtureRecaps field update', () => {
    const id = store.createSession('tok-recap');
    store.updateSessionField(id, 'parsedFixtureRecaps', []);
    const session = store.getSession(id)!;
    expect(session.parsedFixtureRecaps).toEqual([]);
  });

  it('full-blob updateSession still works after partial writes', () => {
    const id = store.createSession('tok-compat');
    store.updateSessionField(id, 'parsedCargos', []);
    const ok = store.updateSession(id, { parsedVessels: [] });
    expect(ok).toBe(true);
    const session = store.getSession(id)!;
    expect(session.parsedVessels).toEqual([]);
  });
});
