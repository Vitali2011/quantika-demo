/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmailsTab } from '@/components/match/EmailsTab';
import { MatchTabs } from '@/components/match/MatchTabs';
import { ToastProvider } from '@/components/ui/toast/toast-context';
import { ToastContainer } from '@/components/ui/toast/toast-container';
import type { Match } from '@/lib/types';

// Mock AuditTrail to avoid real fetch calls
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

function renderWithToast(ui: React.ReactElement) {
  return render(
    <ToastProvider>{ui}<ToastContainer /></ToastProvider>
  );
}

describe('EmailsTab', () => {
  it('renders both cargo and vessel email bodies', () => {
    render(
      <EmailsTab
        cargoEmailBody="CARGO: 25000mt clinker El Arish/POC"
        vesselEmailBody="VESSEL: MV TEST open Alexandria"
      />
    );
    expect(screen.getByText(/25000mt clinker/)).toBeInTheDocument();
    expect(screen.getByText(/MV TEST open Alexandria/)).toBeInTheDocument();
    expect(screen.getByText(/Cargo email/i)).toBeInTheDocument();
    expect(screen.getByText(/Vessel email/i)).toBeInTheDocument();
  });

  it('shows a placeholder when a body is missing', () => {
    render(<EmailsTab cargoEmailBody={null} vesselEmailBody={null} />);
    expect(screen.getAllByText(/not available/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders payout condition block when provided', () => {
    render(
      <EmailsTab
        cargoEmailBody="some cargo"
        vesselEmailBody="some vessel"
        payoutCondition="Payment within 3 banking days"
      />
    );
    expect(screen.getByText(/Payment within 3 banking days/)).toBeInTheDocument();
    expect(screen.getByText(/Payout condition/i)).toBeInTheDocument();
  });

  it('does not render payout block when payoutCondition is null', () => {
    render(
      <EmailsTab
        cargoEmailBody="some cargo"
        vesselEmailBody="some vessel"
        payoutCondition={null}
      />
    );
    expect(screen.queryByText(/Payout condition/i)).not.toBeInTheDocument();
  });

  it('strips <SENDER N> anonymization tokens from rendered bodies', () => {
    render(
      <EmailsTab
        cargoEmailBody="From: <SENDER 1> re: 25000mt clinker"
        vesselEmailBody="Regards, <SENDER 2> open Izmir"
      />
    );
    expect(screen.queryByText(/<SENDER 1>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<SENDER 2>/)).not.toBeInTheDocument();
    expect(screen.getByText(/25000mt clinker/)).toBeInTheDocument();
    expect(screen.getByText(/open Izmir/)).toBeInTheDocument();
  });
});

describe('MatchTabs — Emails tab (PI2 behavioral)', () => {
  it('exposes an Emails tab button', () => {
    renderWithToast(
      <MatchTabs
        match={baseMatch}
        cargoEmailBody="hello cargo"
        vesselEmailBody="hello vessel"
      />
    );
    expect(screen.getByRole('tab', { name: /emails/i })).toBeInTheDocument();
  });

  it('renders EmailsTab content when Emails tab is active (PI2)', () => {
    renderWithToast(
      <MatchTabs
        match={baseMatch}
        cargoEmailBody="CARGO: 25000mt clinker El Arish"
        vesselEmailBody="VESSEL: MV ATLAS open Izmir"
      />
    );
    const emailsTab = screen.getByRole('tab', { name: /emails/i });
    fireEvent.click(emailsTab);
    expect(screen.getByText(/25000mt clinker El Arish/)).toBeInTheDocument();
    expect(screen.getByText(/MV ATLAS open Izmir/)).toBeInTheDocument();
  });
});
