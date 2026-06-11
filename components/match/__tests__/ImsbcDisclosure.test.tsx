/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImsbcDisclosure } from '../ImsbcDisclosure';

test('renders IMSBC reason when check present and expanded', () => {
  render(<ImsbcDisclosure imsbc={{ pass: false, reason: 'IMSBC Group B + DG-restricted' }} />);
  fireEvent.click(screen.getByTestId('imsbc-toggle'));
  expect(screen.getByTestId('imsbc-body')).toHaveTextContent('IMSBC Group B + DG-restricted');
});

test('shows pass state when imsbc.pass is true', () => {
  render(<ImsbcDisclosure imsbc={{ pass: true }} />);
  fireEvent.click(screen.getByTestId('imsbc-toggle'));
  expect(screen.getByTestId('imsbc-body')).toHaveTextContent(/compatible/i);
});

test('renders neutral state when imsbc absent', () => {
  render(<ImsbcDisclosure imsbc={undefined} />);
  expect(screen.queryByTestId('imsbc-toggle')).not.toBeInTheDocument();
});
