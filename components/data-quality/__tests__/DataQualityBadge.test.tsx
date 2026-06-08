/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { DataQualityBadge } from '../DataQualityBadge';

test('DataQualityBadge: tier=estimated renders (est.)', () => {
  const { container } = render(<DataQualityBadge tier="estimated" />);
  expect(container).toHaveTextContent('(est.)');
});

test('DataQualityBadge: tier=stale renders stale with dd-mm date', () => {
  render(<DataQualityBadge tier="stale" asOf="2026-05-09" />);
  expect(screen.getByTestId('data-quality-badge')).toHaveTextContent('stale');
  expect(screen.getByTestId('data-quality-badge')).toHaveTextContent('09-05');
});

test('DataQualityBadge: tier=live renders nothing', () => {
  const { container } = render(<DataQualityBadge tier="live" />);
  expect(container.firstChild).toBeNull();
});
