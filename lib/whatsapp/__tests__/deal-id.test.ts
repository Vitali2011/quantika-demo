import Database from 'better-sqlite3';
import { formatDealId, parseDealId, assignNextDealId } from '../deal-id';
import { runMigrations } from '../../migrations/runner';
import { allMigrations } from '../../migrations/index';

describe('formatDealId', () => {
  it('formats a numeric id with D- prefix', () => {
    expect(formatDealId(47)).toBe('D-47');
  });

  it('formats zero', () => {
    expect(formatDealId(0)).toBe('D-0');
  });

  it('formats large numbers', () => {
    expect(formatDealId(1000)).toBe('D-1000');
  });
});

describe('parseDealId', () => {
  it('parses D-47 format', () => {
    expect(parseDealId('D-47')).toBe(47);
  });

  it('parses D47 format (no hyphen)', () => {
    expect(parseDealId('D47')).toBe(47);
  });

  it('parses lowercase d-47', () => {
    expect(parseDealId('d-47')).toBe(47);
  });

  it('parses lowercase d47', () => {
    expect(parseDealId('d47')).toBe(47);
  });

  it('returns null for invalid string', () => {
    expect(parseDealId('not-a-deal')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDealId('')).toBeNull();
  });

  it('roundtrips with formatDealId', () => {
    const id = 123;
    const formatted = formatDealId(id);
    expect(parseDealId(formatted)).toBe(id);
  });
});

describe('assignNextDealId', () => {
  let db: Database.Database;
  let getDb: () => Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
    getDb = () => db;
  });

  afterEach(() => {
    db.close();
  });

  it('assigns D-1 for the first deal in a session', async () => {
    const dealId = await assignNextDealId('session-abc', getDb);
    expect(dealId).toBe('D-1');
  });

  it('increments counter on subsequent calls', async () => {
    await assignNextDealId('session-abc', getDb);
    const second = await assignNextDealId('session-abc', getDb);
    expect(second).toBe('D-2');
  });

  it('maintains separate counters per session', async () => {
    await assignNextDealId('session-a', getDb);
    await assignNextDealId('session-a', getDb);
    const firstB = await assignNextDealId('session-b', getDb);
    expect(firstB).toBe('D-1');
  });
});
