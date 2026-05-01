import { resolveExtensionCta } from '@/lib/deadlines/cta';

describe('resolveExtensionCta', () => {
  it('falls back to mailto when plan-first module is unavailable', () => {
    const cta = resolveExtensionCta({
      dealId: 'deal-1',
      counterparty: 'ACME Charterers',
      counterpartyEmail: 'ops@acme.test',
      deadlineAt: '2026-04-30T06:00:00Z',
      planFirstAvailable: false,
    });
    expect(cta.kind).toBe('mailto');
    expect(cta.href).toMatch(/^mailto:ops@acme\.test/);
    expect(cta.href).toContain('subs');
  });

  it('uses plan-first endpoint when available', () => {
    const cta = resolveExtensionCta({
      dealId: 'deal-1',
      counterparty: 'ACME Charterers',
      deadlineAt: '2026-04-30T06:00:00Z',
      planFirstAvailable: true,
    });
    expect(cta.kind).toBe('plan-first');
    expect(cta.href).toBe('/api/agent/plan');
  });

  it('mailto fallback works without an explicit email', () => {
    const cta = resolveExtensionCta({
      dealId: 'deal-1',
      counterparty: 'ACME Charterers',
      deadlineAt: '2026-04-30T06:00:00Z',
      planFirstAvailable: false,
    });
    expect(cta.kind).toBe('mailto');
    expect(cta.href).toMatch(/^mailto:/);
  });
});
