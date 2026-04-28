import { TrialBanner } from '../TrialBanner';

describe('TrialBanner', () => {
  it('renders days remaining when not expired', () => {
    const el = TrialBanner({ daysRemaining: 10, expired: false });
    const text = JSON.stringify(el);
    expect(text).toContain('10');
    expect(text).toContain('days remaining');
  });

  it('renders upgrade CTA when expired', () => {
    const el = TrialBanner({ daysRemaining: 0, expired: true });
    const text = JSON.stringify(el);
    expect(text).toContain('expired');
    expect(text).toContain('/upgrade');
  });

  it('includes upgrade link for active trial', () => {
    const el = TrialBanner({ daysRemaining: 7, expired: false });
    const text = JSON.stringify(el);
    expect(text).toContain('Upgrade now');
    expect(text).toContain('/upgrade');
  });
});
