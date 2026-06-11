/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogicDisclosure } from '../LogicDisclosure';

test('toggles children, label always visible', () => {
  render(<LogicDisclosure label="Details" testId="x"><p>hidden body</p></LogicDisclosure>);
  expect(screen.getByText('Details')).toBeInTheDocument();
  expect(screen.queryByText('hidden body')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('x-toggle'));
  expect(screen.getByText('hidden body')).toBeInTheDocument();
});
