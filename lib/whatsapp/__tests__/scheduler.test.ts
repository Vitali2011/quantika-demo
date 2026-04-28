import { shouldSendDigestNow } from '../scheduler';

interface WhatsAppUser {
  phone: string;
  session_id: string;
  onboarded_at: string | null;
  region: string | null;
  timezone: string | null;
  locale: string | null;
  last_digest_sent_at: string | null;
  created_at: string;
}

function makeUser(overrides: Partial<WhatsAppUser> = {}): WhatsAppUser {
  return {
    phone: '+971501234567',
    session_id: 'sess-1',
    onboarded_at: '2026-04-01T10:00:00.000Z',
    region: 'MENA',
    timezone: 'Asia/Dubai',
    locale: 'en',
    last_digest_sent_at: null,
    created_at: '2026-04-01T08:00:00.000Z',
    ...overrides,
  };
}

// 08:30 Dubai = 04:30 UTC
const AT_0830_DUBAI = new Date('2026-04-28T04:30:00.000Z');
// 12:00 Dubai = 08:00 UTC (Tuesday)
const AT_1200_DUBAI_TUESDAY = new Date('2026-04-28T08:00:00.000Z');
// Friday 13:30 Dubai = Friday 09:30 UTC
const AT_FRIDAY_1330_DUBAI = new Date('2026-05-01T09:30:00.000Z');
// Friday 08:30 Dubai = Friday 04:30 UTC
const AT_FRIDAY_0830_DUBAI = new Date('2026-05-01T04:30:00.000Z');
// Ramadan 2026-03-15 08:30 Dubai = 04:30 UTC
const AT_RAMADAN_0830_DUBAI = new Date('2026-03-15T04:30:00.000Z');

describe('shouldSendDigestNow', () => {
  it('returns true at 08:30 user timezone when never sent today', () => {
    const user = makeUser({ last_digest_sent_at: null });
    expect(shouldSendDigestNow(user, AT_0830_DUBAI)).toBe(true);
  });

  it('returns false at 08:30 if digest already sent today', () => {
    // last sent at 08:31 same day
    const user = makeUser({ last_digest_sent_at: '2026-04-28T04:31:00.000Z' });
    expect(shouldSendDigestNow(user, AT_0830_DUBAI)).toBe(false);
  });

  it('returns true at 08:30 if digest sent yesterday', () => {
    const user = makeUser({ last_digest_sent_at: '2026-04-27T04:30:00.000Z' });
    expect(shouldSendDigestNow(user, AT_0830_DUBAI)).toBe(true);
  });

  it('returns false at 12:00 (not digest time)', () => {
    const user = makeUser({ last_digest_sent_at: null });
    expect(shouldSendDigestNow(user, AT_1200_DUBAI_TUESDAY)).toBe(false);
  });

  it('returns false during Friday quiet hours 13:30 GST', () => {
    const user = makeUser({ last_digest_sent_at: null, timezone: 'Asia/Dubai' });
    expect(shouldSendDigestNow(user, AT_FRIDAY_1330_DUBAI)).toBe(false);
  });

  it('returns true on Friday at 08:30 (before quiet hours)', () => {
    const user = makeUser({ last_digest_sent_at: null });
    expect(shouldSendDigestNow(user, AT_FRIDAY_0830_DUBAI)).toBe(true);
  });

  it('returns false during Ramadan 2026 morning (before Iftar)', () => {
    const user = makeUser({ last_digest_sent_at: null });
    expect(shouldSendDigestNow(user, AT_RAMADAN_0830_DUBAI)).toBe(false);
  });

  it('returns false when user has no timezone set', () => {
    const user = makeUser({ timezone: null });
    expect(shouldSendDigestNow(user, AT_0830_DUBAI)).toBe(false);
  });
});
