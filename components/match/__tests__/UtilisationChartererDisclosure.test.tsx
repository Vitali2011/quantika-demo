/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { UtilisationChartererDisclosure } from '../UtilisationChartererDisclosure';

const fbWithBoth = JSON.stringify({
  components: [
    { factor: 'utilisation', label: 'Size / utilisation', weight: 19, score: 14.4,
      rationale: 'Cargo fills ~90% of the ship — a near-full load.', bracketData: '45,000 / 50,000 mt' },
  ],
  totalWeight: 100, sanctionsPenalty: 0, chartererPenalty: 4,
});

const fbNoChartererPenalty = JSON.stringify({
  components: [
    { factor: 'utilisation', label: 'Size / utilisation', weight: 19, score: 14.4,
      rationale: 'Cargo fills ~90% of the ship.', bracketData: '45,000 / 50,000 mt' },
  ],
  totalWeight: 100, sanctionsPenalty: 0, chartererPenalty: 0,
});

test('collapsed by default, expands on click', () => {
  render(<UtilisationChartererDisclosure fitBreakdown={fbWithBoth} />);
  expect(screen.queryByText(/45,000/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('util-charterer-toggle'));
  expect(screen.getByTestId('util-charterer-body')).toBeInTheDocument();
});

test('shows utilisation bracket when expanded', () => {
  render(<UtilisationChartererDisclosure fitBreakdown={fbWithBoth} />);
  fireEvent.click(screen.getByTestId('util-charterer-toggle'));
  expect(screen.getByTestId('util-charterer-body')).toHaveTextContent('45,000 / 50,000 mt');
});

test('shows charterer penalty line when penalty > 0', () => {
  render(<UtilisationChartererDisclosure fitBreakdown={fbWithBoth} />);
  fireEvent.click(screen.getByTestId('util-charterer-toggle'));
  expect(screen.getByTestId('util-charterer-body')).toHaveTextContent('−4');
});

test('no charterer penalty line when penalty is 0', () => {
  render(<UtilisationChartererDisclosure fitBreakdown={fbNoChartererPenalty} />);
  fireEvent.click(screen.getByTestId('util-charterer-toggle'));
  expect(screen.queryByText('−4')).not.toBeInTheDocument();
});

test('renders nothing when fitBreakdown is null', () => {
  const { container } = render(<UtilisationChartererDisclosure fitBreakdown={null} />);
  expect(container).toBeEmptyDOMElement();
});
