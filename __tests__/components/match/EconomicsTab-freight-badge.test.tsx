/**
 * @jest-environment jsdom
 *
 * EconomicsTab — freight-source badge + reset-to-auto button (Wave #7, L2 #7)
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

// jsdom global fetch mock (EconomicsTab fetches the EUA benchmark on mount)
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ value: 75, period: 'Q1 2026' }),
  }),
) as jest.Mock;

describe('EconomicsTab — freight source badge + reset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('estimate → dimmed badge, no reset button, "rate not confirmed" note', () => {
    render(
      <EconomicsTab matchDbId={1} storedFreightRate={18} freightRateSource="estimated" routeDistanceNm={3000} />,
    );
    expect(screen.getByTestId('freight-rate-badge')).toHaveTextContent('Estimate');
    expect(screen.queryByTestId('freight-rate-reset')).not.toBeInTheDocument();
    expect(screen.getByText(/rate not confirmed/i)).toBeInTheDocument();
  });

  it('parsed → "From email" badge', () => {
    render(
      <EconomicsTab matchDbId={1} storedFreightRate={18} freightRateSource="parsed" routeDistanceNm={3000} />,
    );
    expect(screen.getByTestId('freight-rate-badge')).toHaveTextContent('From email');
  });

  it('baltic → "Market" badge', () => {
    render(
      <EconomicsTab matchDbId={1} storedFreightRate={4} freightRateSource="baltic" routeDistanceNm={3000} />,
    );
    expect(screen.getByTestId('freight-rate-badge')).toHaveTextContent('Market');
  });

  it('manual → "Manual" badge + a Reset-to-auto button', () => {
    render(
      <EconomicsTab matchDbId={1} storedFreightRate={30} freightRateSource="manual" routeDistanceNm={3000} />,
    );
    expect(screen.getByTestId('freight-rate-badge')).toHaveTextContent('Manual');
    expect(screen.getByTestId('freight-rate-reset')).toBeInTheDocument();
  });

  it('no stored rate → no badge', () => {
    render(
      <EconomicsTab matchDbId={1} storedFreightRate={null} freightRateSource={null} routeDistanceNm={3000} />,
    );
    expect(screen.queryByTestId('freight-rate-badge')).not.toBeInTheDocument();
  });
});
