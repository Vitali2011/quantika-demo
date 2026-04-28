import { FRIDAY_QUIET_HOURS_GST } from '../constants';
interface TextableClient {
  sendText(to: string, body: string): Promise<{ messageId: string }>;
}
import { buildDigest } from './digest';
import { getStore } from '../session-store';

export interface WhatsAppUser {
  phone: string;
  session_id: string;
  onboarded_at: string | null;
  region: string | null;
  timezone: string | null;
  locale: string | null;
  last_digest_sent_at: string | null;
  created_at: string;
}

// Ramadan 2026: March 1 – March 30 (hardcoded; Wave γ will add proper Hijri calendar)
const RAMADAN_2026_START = new Date('2026-03-01T00:00:00.000Z');
const RAMADAN_2026_END = new Date('2026-03-30T23:59:59.999Z');

function isRamadanDay(date: Date): boolean {
  return date >= RAMADAN_2026_START && date <= RAMADAN_2026_END;
}

function getLocalDateStr(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(date);
}

function getLocalHour(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  const minutePart = parts.find((p) => p.type === 'minute');
  const h = parseInt(hourPart?.value ?? '0', 10);
  const m = parseInt(minutePart?.value ?? '0', 10);
  return h + m / 60;
}

function getLocalDayOfWeek(date: Date, timezone: string): number {
  // 0 = Sunday, 5 = Friday
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekday ?? 'Sun'] ?? 0;
}

export function shouldSendDigestNow(user: WhatsAppUser, now: Date): boolean {
  if (!user.timezone) return false;

  const localHour = getLocalHour(now, user.timezone);
  const localDay = getLocalDayOfWeek(now, user.timezone);
  const gstHour = getLocalHour(now, FRIDAY_QUIET_HOURS_GST.timezone);
  const gstDay = getLocalDayOfWeek(now, FRIDAY_QUIET_HOURS_GST.timezone);

  // Friday quiet hours 13:00-15:00 GST
  if (
    gstDay === 5 &&
    gstHour >= FRIDAY_QUIET_HOURS_GST.startHour &&
    gstHour < FRIDAY_QUIET_HOURS_GST.endHour
  ) {
    return false;
  }

  // Ramadan 2026: suppress before Iftar (~18:30 Dubai); use a simple full-day block as placeholder
  if (isRamadanDay(now)) {
    return false;
  }

  // Must be 08:30 ± 30 min in user's timezone (i.e. between 8.0 and 9.0)
  if (localHour < 8.0 || localHour >= 9.0) {
    return false;
  }

  // Must not have already sent digest today (in user's local date)
  if (user.last_digest_sent_at) {
    const lastSentLocalDate = getLocalDateStr(new Date(user.last_digest_sent_at), user.timezone);
    const todayLocalDate = getLocalDateStr(now, user.timezone);
    if (lastSentLocalDate === todayLocalDate) {
      return false;
    }
  }

  void localDay; // used for Friday check via GST path
  return true;
}

export async function sendMorningDigests(
  client: TextableClient,
): Promise<{ sent: number; skipped: number }> {
  const db = getStore().getDatabase();
  const now = new Date();

  const users = db
    .prepare<[], WhatsAppUser>('SELECT * FROM whatsapp_users WHERE onboarded_at IS NOT NULL')
    .all();

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    if (!shouldSendDigestNow(user, now)) {
      skipped++;
      continue;
    }

    const text = await buildDigest(user.session_id, now);
    await client.sendText(user.phone, text);

    db.prepare('UPDATE whatsapp_users SET last_digest_sent_at = ? WHERE phone = ?').run(
      now.toISOString(),
      user.phone,
    );

    sent++;
  }

  return { sent, skipped };
}
