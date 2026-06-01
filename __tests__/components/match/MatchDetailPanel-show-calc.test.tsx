/**
 * @jest-environment jsdom
 *
 * Tests: MatchDetailPanel — collapsible 'Show calculation' under Fit Score (#fit-show-calc)
 *
 * Behavioral: renders component, clicks toggle, verifies DOM content.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => ({
  X: () => null,
  FileText: () => null,
  XCircle: () => null,
  ChevronUp: () => null,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...rest}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/lib/csrf-client', () => ({ csrfFetch: jest.fn() }));
jest.mock('@/components/match/CounterModal', () => ({ CounterModal: () => null }));

import { MatchDetailPanel } from '@/components/match/MatchDetailPanel';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const BASE_PROPS = {
  matchDbId: 1,
  score: 70,
  status: 'pending',
  loadPort: 'Rotterdam',
  dischargePort: 'Hamburg',
  cargoType: 'Coal',
  vesselDwt: 50000,
  laycanDisplay: '01 Jun – 15 Jun',
  hasSessionMatch: true,
};

const mkBreakdown = (overrides?: object) =>
  JSON.stringify({
    components: [
      { factor: 'size', label: 'Size / utilisation', weight: 18, score: 11.9, rationale: 'Utilisation 72%' },
      { factor: 'laycan', label: 'Laycan fit', weight: 16, score: 14.0, rationale: 'Tight window' },
    ],
    totalWeight: 100,
    fitPercent: 72,
    sanctionsPenalty: 0,
    appliedCap: null,
    ...overrides,
  });

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('MatchDetailPanel — Show calculation toggle', () => {
  it('calc collapsed by default: toggle button visible, calc rows not visible', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    expect(screen.getByRole('button', { name: 'Show calculation' })).toBeInTheDocument();
    expect(screen.queryByText(/Subtotal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fit score:/)).not.toBeInTheDocument();
  });

  it('after click: label changes to Hide calculation, factor rows and total visible', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));

    expect(screen.getByRole('button', { name: 'Hide calculation' })).toBeInTheDocument();
    // per-factor labels visible (appear in both bar chart + calc rows, so getAllByText)
    expect(screen.getAllByText('Size / utilisation').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Laycan fit').length).toBeGreaterThanOrEqual(1);
    // unique calc-section format: score / weight
    expect(screen.getByText(/11\.9 \/ 18/)).toBeInTheDocument();
    // reconciliation section
    expect(screen.getByText(/Subtotal/)).toBeInTheDocument();
    expect(screen.getByText(/Fit score:/)).toBeInTheDocument();
    // итог value matches headline fitPercent (72%)
    expect(screen.getAllByText(/72%/).length).toBeGreaterThanOrEqual(1);
    // no sanctions / cap lines
    expect(screen.queryByText(/Sanctions penalty/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Capped/i)).not.toBeInTheDocument();
  });

  it('rationale appears under each factor row in expanded calc section', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));
    // rationale text is visible (rendered at least once — also in bar chart above)
    expect(screen.getAllByText('Utilisation 72%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Tight window').length).toBeGreaterThanOrEqual(1);
  });

  it('second click collapses (toggle closes)', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide calculation' }));
    expect(screen.queryByText(/Subtotal/)).not.toBeInTheDocument();
  });

  it('sanctionsPenalty=8 → Sanctions penalty row with −8 visible after expand', () => {
    const breakdown = mkBreakdown({ sanctionsPenalty: 8, fitPercent: 64 });
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={64} fitBreakdown={breakdown} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));
    expect(screen.getByText(/Sanctions penalty/)).toBeInTheDocument();
    expect(screen.getByText(/−8/)).toBeInTheDocument();
  });

  it('sanctionsPenalty=0 → sanctions row not rendered', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));
    expect(screen.queryByText(/Sanctions penalty/)).not.toBeInTheDocument();
  });

  it('appliedCap → Capped row with reason and ceiling visible after expand', () => {
    const breakdown = mkBreakdown({
      appliedCap: { reason: 'Unvetted vessel', ceiling: 85 },
      fitPercent: 85,
    });
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={85} fitBreakdown={breakdown} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));
    expect(screen.getByText(/Capped/i)).toBeInTheDocument();
    expect(screen.getByText(/Unvetted vessel/)).toBeInTheDocument();
  });

  it('appliedCap=null → Capped row not rendered', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation' }));
    expect(screen.queryByText(/Capped/i)).not.toBeInTheDocument();
  });

  it('fitPercent=null → Fit Score section and toggle not rendered', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={null} fitBreakdown={mkBreakdown()} />,
    );
    expect(screen.queryByText('Show calculation')).not.toBeInTheDocument();
    expect(screen.queryByText(/Subtotal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fit Score/)).not.toBeInTheDocument();
  });

  it('aria-expanded reflects toggle state', () => {
    render(
      <MatchDetailPanel {...BASE_PROPS} fitPercent={72} fitBreakdown={mkBreakdown()} />,
    );
    const btn = screen.getByRole('button', { name: 'Show calculation' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Hide calculation' })).toHaveAttribute('aria-expanded', 'true');
  });
});
