/**
 * Tests — migration 037 (user_preferences table with preferred_mode).
 *
 * Covers:
 *   - up() creates user_preferences table with username PK and preferred_mode column
 *   - Default preferred_mode is 'charterer'
 *   - Allows 'owner' mode
 *   - up() is idempotent (CREATE TABLE IF NOT EXISTS)
 *   - Migration metadata (version, name)
 */

import Database from 'better-sqlite3';
import migration037 from '../037-add-user-preferred-mode';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration037.up(db);
  return db;
}

describe('migration 037 — user_preferences table', () => {
  it('creates user_preferences table', () => {
    const db = freshDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'").get();
    expect(row).toBeTruthy();
  });

  it('default preferred_mode is charterer', () => {
    const db = freshDb();
    db.prepare("INSERT INTO user_preferences (username) VALUES ('alice')").run();
    const u = db.prepare("SELECT preferred_mode FROM user_preferences WHERE username='alice'").get() as { preferred_mode: string };
    expect(u.preferred_mode).toBe('charterer');
  });

  it('allows owner mode', () => {
    const db = freshDb();
    db.prepare("INSERT INTO user_preferences (username, preferred_mode) VALUES ('bob', 'owner')").run();
    const u = db.prepare("SELECT preferred_mode FROM user_preferences WHERE username='bob'").get() as { preferred_mode: string };
    expect(u.preferred_mode).toBe('owner');
  });

  it('is idempotent — re-running up() does not throw', () => {
    const db = new Database(':memory:');
    migration037.up(db);
    expect(() => migration037.up(db)).not.toThrow();
  });

  it('has version=37', () => {
    expect(migration037.version).toBe(37);
  });

  it('has name="037-add-user-preferred-mode"', () => {
    expect(migration037.name).toBe('037-add-user-preferred-mode');
  });
});
