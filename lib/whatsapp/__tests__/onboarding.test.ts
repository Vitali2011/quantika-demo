import Database from 'better-sqlite3';
import { MockWhatsAppClient } from '../__mocks__/client';
import { startOnboarding, handleRegionReply, isOnboarded } from '../onboarding';
import { runMigrations } from '../../migrations/runner';
import { allMigrations } from '../../migrations/index';

function makeMsg(phone: string, id = 'msg-1') {
  return {
    id,
    from: phone,
    timestamp: '1714291200',
    type: 'text' as const,
    text: { body: 'hi' },
  };
}

describe('startOnboarding', () => {
  it('sends an interactive button message with 4 region options', async () => {
    const client = new MockWhatsAppClient();
    await startOnboarding(client, makeMsg('+97150111'));

    expect(client.sentMessages).toHaveLength(1);
    const msg = client.sentMessages[0];
    expect(msg.type).toBe('interactive');
    if (msg.type === 'interactive') {
      expect(msg.interactive.type).toBe('button');
      const action = msg.interactive.action as { buttons: Array<{ reply: { id: string } }> };
      const ids = action.buttons.map((b) => b.reply.id);
      expect(ids).toContain('region:MENA');
      expect(ids).toContain('region:Med');
      expect(ids).toContain('region:WAFR');
    }
  });

  it('marks the message as read', async () => {
    const client = new MockWhatsAppClient();
    await startOnboarding(client, makeMsg('+97150111', 'msg-read-test'));
    expect(client.readMessages).toContain('msg-read-test');
  });
});

describe('handleRegionReply', () => {
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

  it('persists region and marks user as onboarded', async () => {
    const client = new MockWhatsAppClient();
    const phone = '+97150222';
    await handleRegionReply(client, makeMsg(phone), 'MENA', getDb);

    const row = db.prepare('SELECT * FROM whatsapp_users WHERE phone = ?').get(phone) as {
      region: string; onboarded_at: string | null;
    };
    expect(row.region).toBe('MENA');
    expect(row.onboarded_at).not.toBeNull();
  });

  it('persists Med region', async () => {
    const client = new MockWhatsAppClient();
    const phone = '+97150333';
    await handleRegionReply(client, makeMsg(phone), 'Med', getDb);

    const row = db.prepare('SELECT * FROM whatsapp_users WHERE phone = ?').get(phone) as {
      region: string;
    };
    expect(row.region).toBe('Med');
  });

  it('sends confirmation with forward CTA buttons', async () => {
    const client = new MockWhatsAppClient();
    await handleRegionReply(client, makeMsg('+97150444'), 'WAFR', getDb);

    expect(client.sentMessages).toHaveLength(1);
    const msg = client.sentMessages[0];
    expect(msg.type).toBe('interactive');
    if (msg.type === 'interactive') {
      expect(msg.interactive.body.text).toContain('WAFR');
      const action = msg.interactive.action as { buttons: Array<{ reply: { id: string } }> };
      const ids = action.buttons.map((b) => b.reply.id);
      expect(ids).toContain('try:sample');
      expect(ids).toContain('forward:later');
    }
  });
});

describe('isOnboarded', () => {
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

  it('returns false for unknown phone', async () => {
    expect(await isOnboarded('+00000000', getDb)).toBe(false);
  });

  it('returns false when onboarded_at is null', async () => {
    db.prepare(
      "INSERT INTO whatsapp_users (phone, session_id) VALUES (?, ?)"
    ).run('+97150555', 'sess-x');
    expect(await isOnboarded('+97150555', getDb)).toBe(false);
  });

  it('returns true when onboarded_at is set', async () => {
    db.prepare(
      "INSERT INTO whatsapp_users (phone, session_id, onboarded_at) VALUES (?, ?, datetime('now'))"
    ).run('+97150666', 'sess-y');
    expect(await isOnboarded('+97150666', getDb)).toBe(true);
  });
});
