import {
  computeStage,
  processDeadline,
  type SubsDeadline,
} from '@/lib/deadlines/subs-guardian';
import { getChannelsForStage } from '@/lib/deadlines/escalation-policy';

const HOUR = 3600 * 1000;

function isoIn(ms: number, base = Date.now()): string {
  return new Date(base + ms).toISOString();
}

describe('computeStage', () => {
  const now = new Date('2026-04-30T00:00:00Z');

  it('returns pending when more than 24h remain', () => {
    expect(computeStage(isoIn(25 * HOUR, now.getTime()), now)).toBe('pending');
  });

  it('returns 24h when between 8h..24h', () => {
    expect(computeStage(isoIn(20 * HOUR, now.getTime()), now)).toBe('24h');
  });

  it('returns 8h when between 4h..8h', () => {
    expect(computeStage(isoIn(6 * HOUR, now.getTime()), now)).toBe('8h');
  });

  it('returns 4h when between 2h..4h', () => {
    expect(computeStage(isoIn(3 * HOUR, now.getTime()), now)).toBe('4h');
  });

  it('returns 2h when between 0..2h', () => {
    expect(computeStage(isoIn(1 * HOUR, now.getTime()), now)).toBe('2h');
  });

  it('returns expired when deadline has passed', () => {
    expect(computeStage(isoIn(-1 * HOUR, now.getTime()), now)).toBe('expired');
  });
});

describe('processDeadline', () => {
  const baseDeadline = (overrides: Partial<SubsDeadline> = {}): SubsDeadline => ({
    dealId: 'deal-1',
    counterparty: 'ACME Charterers',
    deadlineAt: isoIn(1 * HOUR),
    stage: 'pending',
    notifiedStages: [],
    ...overrides,
  });

  it('dispatches notifications when first crossing a stage', async () => {
    const result = await processDeadline(baseDeadline({ deadlineAt: isoIn(1 * HOUR) }));
    expect(result.newStage).toBe('2h');
    expect(result.notificationsDispatched.length).toBeGreaterThan(0);
  });

  it('is idempotent — second call same stage dispatches nothing', async () => {
    const d = baseDeadline({
      deadlineAt: isoIn(1 * HOUR),
      notifiedStages: ['2h'],
    });
    const result = await processDeadline(d);
    expect(result.notificationsDispatched).toEqual([]);
  });

  it('2h stage invokes all 3 channels and shows CTA', async () => {
    const result = await processDeadline(baseDeadline({ deadlineAt: isoIn(1 * HOUR) }));
    expect(result.notificationsDispatched).toEqual(
      expect.arrayContaining(['in-app', 'whatsapp', 'gmail']),
    );
    expect(result.ctaShown).toBe(true);
  });

  it('24h stage only dispatches in-app', async () => {
    const result = await processDeadline(baseDeadline({ deadlineAt: isoIn(20 * HOUR) }));
    expect(result.newStage).toBe('24h');
    expect(result.notificationsDispatched).toEqual(['in-app']);
    expect(result.ctaShown).toBe(false);
  });

  it('pending stage dispatches no notifications', async () => {
    const result = await processDeadline(baseDeadline({ deadlineAt: isoIn(48 * HOUR) }));
    expect(result.newStage).toBe('pending');
    expect(result.notificationsDispatched).toEqual([]);
  });
});

describe('getChannelsForStage', () => {
  it('24h → in-app normal only', () => {
    const ch = getChannelsForStage('24h');
    expect(ch).toEqual([
      expect.objectContaining({ channel: 'in-app', priority: 'normal' }),
    ]);
  });

  it('8h → in-app + whatsapp normal', () => {
    const ch = getChannelsForStage('8h');
    expect(ch.map((c) => c.channel).sort()).toEqual(['in-app', 'whatsapp']);
    expect(ch.every((c) => c.priority === 'normal')).toBe(true);
  });

  it('4h → in-app + whatsapp urgent', () => {
    const ch = getChannelsForStage('4h');
    expect(ch.map((c) => c.channel).sort()).toEqual(['in-app', 'whatsapp']);
    expect(ch.every((c) => c.priority === 'urgent')).toBe(true);
  });

  it('2h → all three urgent', () => {
    const ch = getChannelsForStage('2h');
    expect(ch.map((c) => c.channel).sort()).toEqual(['gmail', 'in-app', 'whatsapp']);
    expect(ch.every((c) => c.priority === 'urgent')).toBe(true);
  });
});
