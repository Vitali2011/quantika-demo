import React from 'react';
import { PriorityCard } from '../PriorityCard';

// Mock next/link to avoid circular refs in node test env
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

describe('PriorityCard', () => {
  const baseProps = {
    matchSummary: 'MV Baltic Star × Grain 5000MT',
    keyInsight: 'Ready in 12h, laycan tight',
    reviewHref: '/match/0',
  };

  it('renders without crashing', () => {
    const el = PriorityCard({ ...baseProps, priority: 'ok' });
    expect(el).not.toBeNull();
  });

  it('includes match summary text', () => {
    const el = PriorityCard({ ...baseProps, priority: 'ok' });
    const text = JSON.stringify(el);
    expect(text).toContain('MV Baltic Star × Grain 5000MT');
  });

  it('includes key insight text', () => {
    const el = PriorityCard({ ...baseProps, priority: 'ok' });
    const text = JSON.stringify(el);
    expect(text).toContain('Ready in 12h, laycan tight');
  });

  it('includes a Review link', () => {
    const el = PriorityCard({ ...baseProps, priority: 'urgent' });
    const text = JSON.stringify(el);
    expect(text).toContain('/match/0');
    expect(text).toMatch(/[Rr]eview/);
  });

  it('has red border styling for urgent priority', () => {
    const el = PriorityCard({ ...baseProps, priority: 'urgent' });
    const text = JSON.stringify(el);
    expect(text).toContain('red');
  });

  it('has yellow border styling for attention priority', () => {
    const el = PriorityCard({ ...baseProps, priority: 'attention' });
    const text = JSON.stringify(el);
    expect(text).toContain('yellow');
  });

  it('has green border styling for ok priority', () => {
    const el = PriorityCard({ ...baseProps, priority: 'ok' });
    const text = JSON.stringify(el);
    expect(text).toContain('green');
  });
});
