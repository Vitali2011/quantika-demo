import React from 'react';
import { DashboardTodoSection } from '../DashboardTodoSection';
import { DashboardFreshMatches } from '../DashboardFreshMatches';
import { DashboardInboxSection } from '../DashboardInboxSection';

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

describe('DashboardInboxSection', () => {
  const fullCounts = {
    CARGO_INQUIRY: 5,
    VESSEL_POSITION: 3,
    FIXTURE_RECAP: 1,
    CLIENT_REPLY: 2,
    DOCUMENT: 1,
    VESSEL_CERTIFICATE: 0,
    TCT_REQUEST: 0,
    OTHER: 1,
  };

  it('renders total email count', () => {
    const el = DashboardInboxSection({ counts: fullCounts, totalEmails: 13, needsAction: 0 });
    const text = JSON.stringify(el);
    expect(text).toContain('13');
  });

  it('shows needs-action badge when needsAction > 0', () => {
    const el = DashboardInboxSection({ counts: fullCounts, totalEmails: 13, needsAction: 3 });
    const text = JSON.stringify(el);
    // Badge renders children as array [3, " need action"] — check both parts
    expect(text).toContain('need action');
    expect(text).toContain('"inbox-needs-action"');
  });

  it('does not show needs-action badge when needsAction is 0', () => {
    const el = DashboardInboxSection({ counts: fullCounts, totalEmails: 13, needsAction: 0 });
    const text = JSON.stringify(el);
    expect(text).not.toContain('need action');
  });

  it('renders active categories (non-zero counts only)', () => {
    const el = DashboardInboxSection({ counts: fullCounts, totalEmails: 13, needsAction: 0 });
    const text = JSON.stringify(el);
    expect(text).toContain('Cargo inquiries');
    expect(text).toContain('Vessel positions');
    expect(text).toContain('Fixture recaps');
    // Zero-count categories should not appear
    expect(text).not.toContain('Vessel certificates');
  });

  it('links to /email for both header and footer', () => {
    const el = DashboardInboxSection({ counts: fullCounts, totalEmails: 13, needsAction: 0 });
    const text = JSON.stringify(el);
    const emailLinkCount = (text.match(/\/email/g) || []).length;
    expect(emailLinkCount).toBeGreaterThanOrEqual(2);
  });
});
