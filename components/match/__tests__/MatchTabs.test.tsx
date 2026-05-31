/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MatchTabs } from '../MatchTabs';
import type { Match } from '@/lib/types';
import type { MatchConfidence } from '@/lib/confidence';
import { ToastProvider } from '@/components/ui/toast/toast-context';
import { ToastContainer } from '@/components/ui/toast/toast-container';

function renderWithToast(ui: React.ReactElement) {
  return render(
    <ToastProvider>{ui}<ToastContainer /></ToastProvider>
  );
}

// Mock AuditTrail to avoid real fetch calls
jest.mock('@/components/audit-trail', () => ({
  __esModule: true,
  default: ({ inquiryId }: { inquiryId: string }) => (
    <div data-testid="audit-trail" data-inquiry-id={inquiryId}>Audit Trail</div>
  ),
}));

// Minimal mock data
const mockConfidenceVerified: MatchConfidence = {
  level: 'verified',
  blockSend: false,
  blockedFields: [],
  fieldConfidences: [],
};

const mockConfidenceBlocked: MatchConfidence = {
  level: 'uncertain',
  blockSend: true,
  blockedFields: ['cargo.weightMt', 'vessel.openPosition'],
  fieldConfidences: [],
};

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

describe('MatchTabs', () => {
  describe('tab navigation', () => {
    it('renders all 4 tab buttons', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      expect(screen.getByRole('tab', { name: /vessels/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /economics/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /passport/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /quote/i })).toBeInTheDocument();
    });

    it('shows Vessels tab content by default', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      expect(screen.getByTestId('tab-vessels')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-economics')).not.toBeInTheDocument();
    });

    it('switches to Economics tab on click', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      fireEvent.click(screen.getByRole('tab', { name: /economics/i }));
      expect(screen.getByTestId('tab-economics')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-vessels')).not.toBeInTheDocument();
    });

    it('switches to Passport tab on click', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      fireEvent.click(screen.getByRole('tab', { name: /passport/i }));
      expect(screen.getByTestId('tab-passport')).toBeInTheDocument();
    });

    it('switches to Quote tab on click', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      fireEvent.click(screen.getByRole('tab', { name: /quote/i }));
      expect(screen.getByTestId('tab-quote')).toBeInTheDocument();
    });
  });

  describe('a11y tabpanel markup (stab/tabpanels-render)', () => {
    it('renders exactly one [role="tabpanel"] for the active tab', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      const panels = screen.getAllByRole('tabpanel');
      expect(panels).toHaveLength(1);
    });

    it('active tabpanel is linked to the active tab via aria-labelledby/id', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      const panel = screen.getByRole('tabpanel');
      const labelledBy = panel.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const tab = document.getElementById(labelledBy!);
      expect(tab).not.toBeNull();
      expect(tab!.getAttribute('role')).toBe('tab');
      expect(tab!.getAttribute('aria-selected')).toBe('true');
    });

    it('active tab links to its panel via aria-controls', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      const activeTab = screen.getByRole('tab', { selected: true });
      const controls = activeTab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      const panel = document.getElementById(controls!);
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute('role')).toBe('tabpanel');
    });

    it('switches tabpanel when another tab is clicked', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      fireEvent.click(screen.getByRole('tab', { name: /economics/i }));
      const panel = screen.getByRole('tabpanel');
      const labelledBy = panel.getAttribute('aria-labelledby');
      const tab = document.getElementById(labelledBy!);
      expect(tab!.textContent).toMatch(/economics/i);
    });
  });

  describe('confidence border', () => {
    it('applies verified border class when confidence level is verified', () => {
      const match = { ...baseMatch, confidence: mockConfidenceVerified };
      const { container } = renderWithToast(<MatchTabs match={match} />);
      expect(container.firstChild).toHaveClass('border-blue-500');
    });

    it('applies missing border class when no confidence data', () => {
      const { container } = renderWithToast(<MatchTabs match={baseMatch} />);
      expect(container.firstChild).toHaveClass('border-gray-400');
    });

    it('applies uncertain border class when confidence level is uncertain', () => {
      const match = { ...baseMatch, confidence: mockConfidenceBlocked };
      const { container } = renderWithToast(<MatchTabs match={match} />);
      expect(container.firstChild).toHaveClass('border-orange-500');
    });
  });

  describe('Generate button in Quote tab (fix #638)', () => {
    it('is enabled when cargoEmailId prop is passed', () => {
      renderWithToast(<MatchTabs match={baseMatch} cargoEmailId="cargo-email-1" />);
      fireEvent.click(screen.getByRole('tab', { name: /quote/i }));
      const btn = screen.getByRole('button', { name: /generate/i });
      expect(btn).not.toBeDisabled();
    });

    it('is disabled when cargoEmailId prop is absent', () => {
      renderWithToast(<MatchTabs match={baseMatch} />);
      fireEvent.click(screen.getByRole('tab', { name: /quote/i }));
      const btn = screen.getByRole('button', { name: /generate/i });
      expect(btn).toBeDisabled();
    });
  });

  describe('Send Quote button', () => {
    it('is disabled when draft is empty (blockSend=false)', () => {
      const match = { ...baseMatch, confidence: mockConfidenceVerified };
      renderWithToast(<MatchTabs match={match} />);
      fireEvent.click(screen.getByRole('tab', { name: /quote/i }));
      const btn = screen.getByRole('button', { name: /send quote/i });
      expect(btn).toBeDisabled();
    });

    it('is enabled when draft has content and blockSend is false', () => {
      const match = { ...baseMatch, confidence: mockConfidenceVerified };
      renderWithToast(<MatchTabs match={match} />);
      fireEvent.click(screen.getByRole('tab', { name: /quote/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'USD 15/MT offer' } });
      const btn = screen.getByRole('button', { name: /send quote/i });
      expect(btn).not.toBeDisabled();
    });

    it('is disabled when blockSend is true even with draft content', () => {
      const match = { ...baseMatch, confidence: mockConfidenceBlocked };
      renderWithToast(<MatchTabs match={match} />);
      fireEvent.click(screen.getByRole('tab', { name: /quote/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'USD 15/MT offer' } });
      const btn = screen.getByRole('button', { name: /send quote/i });
      expect(btn).toBeDisabled();
    });
  });
});
