import React from 'react';
import { DashboardTodoSection } from '../DashboardTodoSection';
import { DashboardFreshMatches } from '../DashboardFreshMatches';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// Design-system primitives are used server-side — minimal stubs are enough.
jest.mock('@/design-system/primitives', () => ({
  Card: ({ children, className, padding, interactive, ...rest }: { children: React.ReactNode; className?: string; padding?: string; interactive?: boolean; [key: string]: unknown }) =>
    React.createElement('div', { className, ...rest }, children),
  Pill: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) =>
    React.createElement('span', { 'data-variant': variant, className }, children),
  Badge: ({ children, variant, ...rest }: { children: React.ReactNode; variant?: string; [key: string]: unknown }) =>
    React.createElement('span', { 'data-variant': variant, ...rest }, children),
}));

describe('DashboardTodoSection', () => {
  const urgentCard = {
    priority: 'urgent' as const,
    matchSummary: 'MV Baltic Star × Grain 5000MT',
    keyInsight: 'Ready in 12h, laycan tight',
    href: '/match/0',
  };

  const attentionCard = {
    priority: 'attention' as const,
    matchSummary: 'MV Nordic Wind × Steel 2000MT',
    keyInsight: 'Confidence inferred',
    href: '/match/1',
  };

  it('renders empty state when no cards', () => {
    const el = DashboardTodoSection({ cards: [] });
    const text = JSON.stringify(el);
    expect(text).toContain('All clear');
  });

  it('renders priority pill with correct variant for urgent', () => {
    const el = DashboardTodoSection({ cards: [urgentCard] });
    const text = JSON.stringify(el);
    expect(text).toContain('danger');
    expect(text).toContain('MV Baltic Star');
  });

  it('renders priority pill with warn variant for attention', () => {
    const el = DashboardTodoSection({ cards: [attentionCard] });
    const text = JSON.stringify(el);
    expect(text).toContain('warn');
    expect(text).toContain('MV Nordic Wind');
  });

  it('renders all cards with hrefs pointing to /match routes', () => {
    const el = DashboardTodoSection({ cards: [urgentCard, attentionCard] });
    const text = JSON.stringify(el);
    expect(text).toContain('/match/0');
    expect(text).toContain('/match/1');
  });

  it('shows count badge when cards present', () => {
    const el = DashboardTodoSection({ cards: [urgentCard, attentionCard] });
    const text = JSON.stringify(el);
    // Badge renders with count
    expect(text).toContain('2');
  });

  it('renders only first 5 cards when more than 5 provided', () => {
    const manyCards = Array.from({ length: 8 }, (_, i) => ({
      priority: 'ok' as const,
      matchSummary: `Summary ${i}`,
      keyInsight: `Insight ${i}`,
      href: `/match/${i}`,
    }));
    const el = DashboardTodoSection({ cards: manyCards });
    const text = JSON.stringify(el);
    expect(text).toContain('Summary 0');
    expect(text).toContain('Summary 1');
    expect(text).toContain('Summary 2');
    expect(text).toContain('Summary 3');
    expect(text).toContain('Summary 4');
    expect(text).not.toContain('Summary 5');
  });

  it('shows See all link and full badge count when cards exceed limit', () => {
    const manyCards = Array.from({ length: 8 }, (_, i) => ({
      priority: 'ok' as const,
      matchSummary: `Summary ${i}`,
      keyInsight: `Insight ${i}`,
      href: `/match/${i}`,
    }));
    const el = DashboardTodoSection({ cards: manyCards });
    const text = JSON.stringify(el);
    expect(text).toContain('See all');
    expect(text).toContain('/matches');
    expect(text).toContain('8');
  });

  it('does not show See all link when cards are 5 or fewer', () => {
    const fewCards = Array.from({ length: 5 }, (_, i) => ({
      priority: 'ok' as const,
      matchSummary: `Summary ${i}`,
      keyInsight: `Insight ${i}`,
      href: `/match/${i}`,
    }));
    const el = DashboardTodoSection({ cards: fewCards });
    const text = JSON.stringify(el);
    expect(text).not.toContain('See all');
  });
});

describe('DashboardFreshMatches', () => {
  const highScoreMatch = {
    score: 85,
    matchLevel: 'good',
    matchReasons: ['Compatible port range', 'Laycan overlap'],
    id: 1,
  };

  const midScoreMatch = {
    score: 62,
    matchLevel: 'possible',
    matchReasons: ['Partial overlap'],
    id: 2,
  };

  const lowScoreMatch = {
    score: 45,
    matchLevel: 'possible',
    matchReasons: [],
    id: 3,
  };

  it('renders empty state when no matches', () => {
    const el = DashboardFreshMatches({ matches: [] });
    const text = JSON.stringify(el);
    expect(text).toContain('No matches yet');
  });

  it('renders top match reason as card label', () => {
    const el = DashboardFreshMatches({ matches: [highScoreMatch] });
    const text = JSON.stringify(el);
    expect(text).toContain('Compatible port range');
  });

  it('uses fallback label when matchReasons is empty', () => {
    const el = DashboardFreshMatches({ matches: [lowScoreMatch] });
    const text = JSON.stringify(el);
    expect(text).toContain('Match #3');
  });

  it('renders success pill for score >= 80', () => {
    const el = DashboardFreshMatches({ matches: [highScoreMatch] });
    const text = JSON.stringify(el);
    expect(text).toContain('"success"');
    expect(text).toContain('85');
  });

  it('renders warn pill for score 60-79', () => {
    const el = DashboardFreshMatches({ matches: [midScoreMatch] });
    const text = JSON.stringify(el);
    expect(text).toContain('"warn"');
    expect(text).toContain('62');
  });

  it('limits output to top 5 matches', () => {
    const manyMatches = Array.from({ length: 8 }, (_, i) => ({
      score: 50 + i,
      matchLevel: 'possible',
      matchReasons: [`Reason ${i}`],
      id: i + 1,
    }));
    const el = DashboardFreshMatches({ matches: manyMatches });
    const text = JSON.stringify(el);
    // Only indices 0-4 should be rendered
    expect(text).toContain('Reason 0');
    expect(text).toContain('Reason 4');
    expect(text).not.toContain('Reason 5');
  });

  it('links each match to /match/:id', () => {
    const el = DashboardFreshMatches({ matches: [highScoreMatch, midScoreMatch] });
    const text = JSON.stringify(el);
    expect(text).toContain('/match/1');
    expect(text).toContain('/match/2');
  });
});
