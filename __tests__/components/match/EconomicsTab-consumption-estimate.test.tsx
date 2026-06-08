/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { EconomicsTab } from '@/components/match/EconomicsTab';

// Minimal props: consumption missing but storedTceUsdPerDay available
const baseProps = {
  storedTceUsdPerDay: 4200,
  consumptionEstimated: true,
  cargo: null,
  vessel: null,
  routeDistanceNm: null,
};

test('EconomicsTab shows stored TCE with est. badge when consumption is estimated', () => {
  render(<EconomicsTab {...baseProps as any} />);
  expect(screen.getByTestId('stored-tce-badge')).toBeInTheDocument();
  expect(screen.getByTestId('stored-tce-value')).toHaveTextContent('4,200');
});
