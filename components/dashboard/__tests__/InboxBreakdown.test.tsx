import { InboxBreakdown } from '../InboxBreakdown';

describe('InboxBreakdown', () => {
  const baseStats = {
    cargoInquiries: 5,
    vesselPositions: 3,
    fixtureRecaps: 2,
    clientReplies: 4,
    noise: 7,
  };

  it('renders without crashing', () => {
    const el = InboxBreakdown(baseStats);
    expect(el).not.toBeNull();
  });

  it('includes cargo inquiries count', () => {
    const el = InboxBreakdown(baseStats);
    const text = JSON.stringify(el);
    expect(text).toContain('5');
  });

  it('includes vessel positions count', () => {
    const el = InboxBreakdown(baseStats);
    const text = JSON.stringify(el);
    expect(text).toContain('3');
  });

  it('shows all 5 stat labels', () => {
    const el = InboxBreakdown(baseStats);
    const text = JSON.stringify(el);
    expect(text).toMatch(/[Cc]argo/);
    expect(text).toMatch(/[Vv]essel/);
    expect(text).toMatch(/[Ff]ixture/);
    expect(text).toMatch(/[Rr]epl/);
    expect(text).toMatch(/[Nn]oise/);
  });
});
