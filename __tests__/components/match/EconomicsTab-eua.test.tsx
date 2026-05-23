/**
 * @jest-environment jsdom
 *
 * PI2 behavioral tests for EUA price display in EconomicsTab (closes #403).
 * Uses real component render + fetch mock — not string analysis.
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

function mockFetch(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  } as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EconomicsTab — EUA price tile (closes #403)', () => {
  it('shows EUA price tile in DOM', async () => {
    mockFetch({ indicator: 'EUA', value: 65.4, unit: 'EUR/tCO₂', period: '2026-05-15', stale: false });
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(screen.getByTestId('eua-price-tile')).toBeInTheDocument());
  });

  it('displays live EUA value after fetch resolves', async () => {
    mockFetch({ indicator: 'EUA', value: 65.4, unit: 'EUR/tCO₂', period: '2026-05-15', stale: false });
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(screen.getByTestId('eua-value')).toHaveTextContent('€65.40/tCO₂'));
  });

  it('shows N/A when API returns non-OK (NULL fallback)', async () => {
    mockFetch(null, false);
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(screen.getByTestId('eua-na')).toBeInTheDocument());
    expect(screen.queryByTestId('eua-value')).not.toBeInTheDocument();
  });

  it('shows N/A when fetch throws (network error fallback)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(screen.getByTestId('eua-na')).toBeInTheDocument());
  });

  it('shows stale marker when stale=true', async () => {
    mockFetch({ indicator: 'EUA', value: 72.65, unit: 'EUR/tCO₂', period: '2026-05-04', stale: true });
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(screen.getByTestId('eua-stale')).toBeInTheDocument());
    expect(screen.getByTestId('eua-stale')).toHaveTextContent('Stale');
  });

  it('does NOT show stale marker when stale=false', async () => {
    mockFetch({ indicator: 'EUA', value: 68.5, unit: 'EUR/tCO₂', period: '2026-05-22', stale: false });
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(screen.getByTestId('eua-value')).toBeInTheDocument());
    expect(screen.queryByTestId('eua-stale')).not.toBeInTheDocument();
  });

  it('fetches from /api/market/benchmark?indicator=EUA', async () => {
    mockFetch({ indicator: 'EUA', value: 65.4, unit: 'EUR/tCO₂', period: '2026-05-15', stale: false });
    await act(async () => { render(<EconomicsTab />); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/market/benchmark?indicator=EUA'));
  });
});
