/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { VettingBreakdown } from '../VettingBreakdown';

const fitBreakdownWithVetting = JSON.stringify({
  components: [
    { factor: 'vetting', label: 'Vessel vetting', weight: 7, score: 5.6,
      rationale: 'Items to confirm before fixing: CII rating D, age 22yr.', bracketData: '2 detentions' },
  ],
  totalWeight: 100, sanctionsPenalty: 0,
});

test('collapsed by default, expands on click', () => {
  render(<VettingBreakdown fitBreakdown={fitBreakdownWithVetting} />);
  expect(screen.queryByText(/CII rating D/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('vetting-detail-toggle'));
  expect(screen.getByTestId('vetting-detail-body')).toBeInTheDocument();
});

test('shows vetting rationale when expanded', () => {
  render(<VettingBreakdown fitBreakdown={fitBreakdownWithVetting} />);
  fireEvent.click(screen.getByTestId('vetting-detail-toggle'));
  expect(screen.getByTestId('vetting-detail-body')).toHaveTextContent(/CII rating D/);
  expect(screen.getByTestId('vetting-detail-body')).toHaveTextContent(/2 detentions/);
});

test('renders nothing when no vetting component in fit_breakdown', () => {
  const noVetting = JSON.stringify({ components: [], totalWeight: 100, sanctionsPenalty: 0 });
  const { container } = render(<VettingBreakdown fitBreakdown={noVetting} />);
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when fitBreakdown is null', () => {
  const { container } = render(<VettingBreakdown fitBreakdown={null} />);
  expect(container).toBeEmptyDOMElement();
});
