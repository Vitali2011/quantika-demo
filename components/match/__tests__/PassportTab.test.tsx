/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PassportTab } from '../PassportTab';
import { MatchTabs } from '../MatchTabs';
import type { Match } from '@/lib/types';

jest.mock('@/components/audit-trail', () => ({
  __esModule: true,
  default: ({ inquiryId }: { inquiryId: string }) => (
    <div data-testid="audit-trail" data-inquiry-id={inquiryId}>Audit Trail</div>
  ),
}));

const baseMatch: Match = {
  cargoEmailId: 'cargo-email-1',
  cargoItemIndex: 0,
  vesselEmailId: 'vessel-email-1',
  vesselItemIndex: 0,
  score: 85,
  matchLevel: 'good',
  matchReasons: ['DWT matches cargo'],
  issues: [],
};

describe('PassportTab — Demo data badge', () => {
  it('renders "Demo data" badge when vessel is provided', () => {
    render(
      <PassportTab
        vessel={{
          name: 'Test Vessel',
          flag: 'Panama',
          classSociety: 'Bureau Veritas',
          pandi: 'Skuld',
          restrictions: [],
          lastCargoes: 'Coal',
        } as any}
      />
    );
    expect(screen.getByTestId('passport-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('passport-demo-badge')).toHaveTextContent(/demo data/i);
  });

  it('renders "Demo data" badge when no vessel is provided', () => {
    render(<PassportTab />);
    expect(screen.getByTestId('passport-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('passport-demo-badge')).toHaveTextContent(/demo data/i);
  });

  it('shows Demo data badge on Passport tab via MatchTabs (behavioral)', () => {
    render(<MatchTabs match={baseMatch} />);
    fireEvent.click(screen.getByRole('tab', { name: /passport/i }));
    expect(screen.getByTestId('passport-demo-badge')).toBeInTheDocument();
    expect(screen.getByTestId('passport-demo-badge')).toHaveTextContent(/demo data/i);
  });
});
