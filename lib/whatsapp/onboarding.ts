import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { WhatsAppClient } from './client';
import type { WhatsAppIncomingMessage, WhatsAppButtonAction } from './types';
import { getStore } from '../session-store';
import { MENA_TIMEZONES } from '../constants';

const REGION_TIMEZONE: Record<string, string> = {
  MENA: MENA_TIMEZONES.dubai,
  Med: MENA_TIMEZONES.istanbul,
  WAFR: MENA_TIMEZONES.lagos,
  Other: MENA_TIMEZONES.dubai,
};

export async function startOnboarding(
  client: WhatsAppClient,
  msg: WhatsAppIncomingMessage,
): Promise<void> {
  await client.markAsRead(msg.id);

  const action: WhatsAppButtonAction = {
    buttons: [
      { type: 'reply', reply: { id: 'region:MENA', title: '🌍 MENA' } },
      { type: 'reply', reply: { id: 'region:Med', title: '🌊 Med' } },
      { type: 'reply', reply: { id: 'region:WAFR', title: '🌍 WAFR' } },
    ],
  };

  await client.sendInteractive(msg.from, {
    type: 'button',
    body: {
      text: "Hello 👋 I'm Quantika, your maritime cargo-vessel matcher.\nWhat region do you cover most?",
    },
    action,
  });
}

export async function handleRegionReply(
  client: WhatsAppClient,
  msg: WhatsAppIncomingMessage,
  region: string,
  getDb?: () => Database.Database,
): Promise<void> {
  await client.markAsRead(msg.id);

  const db = getDb ? getDb() : getStore().getDatabase();
  const phone = msg.from;
  const timezone = REGION_TIMEZONE[region] ?? MENA_TIMEZONES.dubai;
  const now = new Date().toISOString();

  const existing = db
    .prepare<[string], { session_id: string }>('SELECT session_id FROM whatsapp_users WHERE phone = ?')
    .get(phone);

  const sessionId = existing?.session_id ?? randomUUID();

  if (existing) {
    db.prepare(`
      UPDATE whatsapp_users
      SET region = ?, timezone = ?, onboarded_at = ?
      WHERE phone = ?
    `).run(region, timezone, now, phone);
  } else {
    db.prepare(`
      INSERT INTO whatsapp_users (phone, session_id, region, timezone, locale, onboarded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(phone, sessionId, region, timezone, 'en', now);
  }

  const action: WhatsAppButtonAction = {
    buttons: [
      { type: 'reply', reply: { id: 'try:sample', title: '🎯 Try sample' } },
      { type: 'reply', reply: { id: 'forward:later', title: '📨 I\'ll forward soon' } },
    ],
  };

  await client.sendInteractive(msg.from, {
    type: 'button',
    body: {
      text: `Got it — ${region}. Forward me your next cargo inquiry (email/PDF/voice/screenshot) and I'll parse it + match vessels in <30 seconds.`,
    },
    action,
  });
}

export async function isOnboarded(
  phone: string,
  getDb?: () => Database.Database,
): Promise<boolean> {
  const db = getDb ? getDb() : getStore().getDatabase();
  const row = db
    .prepare<[string], { onboarded_at: string | null }>(
      'SELECT onboarded_at FROM whatsapp_users WHERE phone = ?',
    )
    .get(phone);
  return row?.onboarded_at != null;
}
