import { buildDigest, type DigestDeal } from '../digest';

// Friday April 24, 2026 at 08:30 Dubai (UTC+4) = 04:30 UTC
const FRIDAY_APR_24 = new Date('2026-04-24T04:30:00.000Z');

describe('buildDigest', () => {
  it('shows market intelligence + forward CTA when 0 active deals', async () => {
    const result = await buildDigest('sess-empty', FRIDAY_APR_24, []);
    expect(result).toContain('Good morning');
    expect(result).toContain('Market');
    expect(result).toContain('Forward your next inquiry');
  });

  it('shows URGENT section when there is 1 urgent deal', async () => {
    const deals: DigestDeal[] = [
      {
        dealId: 'D-47',
        description: 'steel coils Istanbul→Lagos',
        priority: 'urgent',
        note: 'response by 14:00',
      },
    ];
    const result = await buildDigest('sess-1', FRIDAY_APR_24, deals);
    expect(result).toContain('🔴 URGENT (1)');
    expect(result).toContain('D-47');
    expect(result).toContain('steel coils Istanbul→Lagos');
    expect(result).toContain('response by 14:00');
  });

  it('shows ATTENTION section for attention-priority deals', async () => {
    const deals: DigestDeal[] = [
      { dealId: 'D-43', description: 'counter-offer 2 days', priority: 'attention' },
      { dealId: 'D-51', description: 'docs missing', priority: 'attention' },
    ];
    const result = await buildDigest('sess-2', FRIDAY_APR_24, deals);
    expect(result).toContain('⚠️ ATTENTION (2)');
    expect(result).toContain('D-43');
    expect(result).toContain('D-51');
  });

  it('shows OK count for ok-priority deals', async () => {
    const deals: DigestDeal[] = [
      { dealId: 'D-1', description: 'on track', priority: 'ok' },
      { dealId: 'D-2', description: 'on track', priority: 'ok' },
      { dealId: 'D-3', description: 'on track', priority: 'ok' },
    ];
    const result = await buildDigest('sess-3', FRIDAY_APR_24, deals);
    expect(result).toContain('✅ OK (3 deals)');
  });

  it('includes mixed priorities in correct sections', async () => {
    const deals: DigestDeal[] = [
      { dealId: 'D-47', description: 'steel coils', priority: 'urgent', note: 'by 14:00' },
      { dealId: 'D-43', description: 'counter-offer', priority: 'attention' },
      { dealId: 'D-51', description: 'docs missing', priority: 'attention' },
      { dealId: 'D-10', description: 'all good', priority: 'ok' },
      { dealId: 'D-11', description: 'all good', priority: 'ok' },
      { dealId: 'D-12', description: 'all good', priority: 'ok' },
    ];
    const result = await buildDigest('sess-4', FRIDAY_APR_24, deals);
    expect(result).toContain('🔴 URGENT (1)');
    expect(result).toContain('⚠️ ATTENTION (2)');
    expect(result).toContain('✅ OK (3 deals)');
    expect(result).toContain('📊 Market');
  });

  it('includes the date in the header', async () => {
    const result = await buildDigest('sess-5', FRIDAY_APR_24, []);
    expect(result).toMatch(/Friday.*24.*Apr|24.*Apr.*Friday/);
  });
});
