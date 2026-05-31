/**
 * @jest-environment jsdom
 *
 * PI2 behavioral tests for JWC war-risk section in EconomicsTab.
 * Replaces "coming in Wave 2" placeholder with real breakdown render.
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';
import type { WarRiskBreakdown } from '@/lib/economics/war-risk';

function mockEuaFetch() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ value: 65.0, period: '2026-05-31', stale: false }),
  } as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

const WAR_RISK_BREAKDOWN: WarRiskBreakdown = {
  hullPremiumUsd: 6_000,
  crewWarBonusUsd: 10_000,
  piSurchargeUsd: 20_000,
  totalPremiumUsd: 36_000,
};

describe('EconomicsTab — JWC war-risk section', () => {
  it('renders JWC zone names when war risk zones are present', async () => {
    mockEuaFetch();
    await act(async () => {
      render(
        <EconomicsTab
          warRiskPremium={6_000}
          warRiskZones={['Red Sea / Bab al-Mandeb HRA']}
          warRiskBreakdown={WAR_RISK_BREAKDOWN}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('warrisk-section')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('warrisk-section')).toHaveTextContent(
      'Red Sea / Bab al-Mandeb HRA',
    );
  });

  it('renders hull, crew, P&I, and total breakdown rows', async () => {
    mockEuaFetch();
    await act(async () => {
      render(
        <EconomicsTab
          warRiskPremium={6_000}
          warRiskZones={['Red Sea / Bab al-Mandeb HRA']}
          warRiskBreakdown={WAR_RISK_BREAKDOWN}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('warrisk-section')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('warrisk-hull')).toHaveTextContent('6,000');
    expect(screen.getByTestId('warrisk-crew')).toHaveTextContent('10,000');
    expect(screen.getByTestId('warrisk-pi')).toHaveTextContent('20,000');
    expect(screen.getByTestId('warrisk-total')).toHaveTextContent('36,000');
  });

  it('does NOT show the Wave 2 placeholder when war risk data is provided', async () => {
    mockEuaFetch();
    await act(async () => {
      render(
        <EconomicsTab
          warRiskPremium={6_000}
          warRiskZones={['Gulf of Guinea HRA']}
          warRiskBreakdown={WAR_RISK_BREAKDOWN}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('warrisk-section')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/coming in spec-08/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Wave 2/i)).not.toBeInTheDocument();
  });

  it('shows no-risk message when warRiskPremium is 0', async () => {
    mockEuaFetch();
    await act(async () => {
      render(
        <EconomicsTab
          warRiskPremium={0}
          warRiskZones={[]}
          warRiskBreakdown={undefined}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('warrisk-none')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('warrisk-section')).not.toBeInTheDocument();
  });

  it('shows no-risk message when warRiskPremium is undefined (not passed)', async () => {
    mockEuaFetch();
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() =>
      expect(screen.getByTestId('warrisk-none')).toBeInTheDocument(),
    );
  });

  it('handles multiple zones in the same route', async () => {
    mockEuaFetch();
    const breakdown: WarRiskBreakdown = {
      hullPremiumUsd: 12_000,
      crewWarBonusUsd: 10_000,
      piSurchargeUsd: 20_000,
      totalPremiumUsd: 42_000,
    };
    await act(async () => {
      render(
        <EconomicsTab
          warRiskPremium={12_000}
          warRiskZones={['Red Sea / Bab al-Mandeb HRA', 'Gulf of Guinea HRA']}
          warRiskBreakdown={breakdown}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('warrisk-section')).toBeInTheDocument(),
    );
    const section = screen.getByTestId('warrisk-section');
    expect(section).toHaveTextContent('Red Sea / Bab al-Mandeb HRA');
    expect(section).toHaveTextContent('Gulf of Guinea HRA');
  });
});
