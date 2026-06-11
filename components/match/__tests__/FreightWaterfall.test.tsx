/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { FreightWaterfall } from '../FreightWaterfall';

test('highlights the winning tier (baltic) and shows the rate', () => {
  render(<FreightWaterfall source="baltic" rateUsdPerMt={24.5} />);
  fireEvent.click(screen.getByTestId('freight-waterfall-toggle'));
  const winner = screen.getByTestId('freight-tier-baltic');
  expect(winner).toHaveAttribute('data-winner', 'true');
  expect(winner).toHaveTextContent('$24.50');
});

test('unknown source → no winner highlighted, no crash', () => {
  render(<FreightWaterfall source={null} rateUsdPerMt={null} />);
  fireEvent.click(screen.getByTestId('freight-waterfall-toggle'));
  expect(screen.queryByTestId('freight-tier-baltic')).toHaveAttribute('data-winner', 'false');
});

test('source=custom (unknown string) → no tier highlighted, no crash', () => {
  render(<FreightWaterfall source="custom" rateUsdPerMt={10} />);
  fireEvent.click(screen.getByTestId('freight-waterfall-toggle'));
  expect(screen.getByTestId('freight-tier-manual')).toHaveAttribute('data-winner', 'false');
  expect(screen.getByTestId('freight-tier-parsed')).toHaveAttribute('data-winner', 'false');
  expect(screen.getByTestId('freight-tier-baltic')).toHaveAttribute('data-winner', 'false');
  expect(screen.getByTestId('freight-tier-estimated')).toHaveAttribute('data-winner', 'false');
});
