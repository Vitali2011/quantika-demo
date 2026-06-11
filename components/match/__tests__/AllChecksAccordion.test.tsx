/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { AllChecksAccordion } from '../AllChecksAccordion';
import type { MatchHardFilters } from '@/lib/types';

const hf: MatchHardFilters = {
  draft: { pass: true }, crane: { pass: true, warning: true, reason: 'Confirm cranes' },
  volume: { pass: true }, cargoVessel: { pass: true }, destDraft: { pass: true },
  destCrane: { pass: true }, cargoWeight: { pass: true },
  imsbc: { pass: false, reason: 'IMSBC Group B + DG-restricted' },
  vesselAge: { pass: true }, dimensions: { pass: true }, gearRequired: { pass: true },
  voyage: { pass: true }, flagClass: { pass: true }, warPositionVoyage: { pass: true },
};

test('collapsed by default, expands on click', () => {
  render(<AllChecksAccordion hardFilters={hf} />);
  expect(screen.queryByText(/IMSBC Group B/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('all-checks-toggle'));
  expect(screen.getByText(/IMSBC Group B/)).toBeInTheDocument();
});

test('renders pass / fail / warn verdicts', () => {
  render(<AllChecksAccordion hardFilters={hf} />);
  fireEvent.click(screen.getByTestId('all-checks-toggle'));
  const body = screen.getByTestId('all-checks-body');
  expect(body).toHaveTextContent('IMSBC'); // failed gate shown
  expect(body).toHaveTextContent('Confirm cranes'); // warn reason shown
});

test('omits gates absent from pre-this-PR data', () => {
  const partial = { draft: { pass: true }, crane: { pass: true }, volume: { pass: true },
    cargoVessel: { pass: true }, destDraft: { pass: true }, destCrane: { pass: true },
    cargoWeight: { pass: true } } as MatchHardFilters;
  render(<AllChecksAccordion hardFilters={partial} />);
  fireEvent.click(screen.getByTestId('all-checks-toggle'));
  expect(screen.queryByText(/War position/i)).not.toBeInTheDocument();
});
