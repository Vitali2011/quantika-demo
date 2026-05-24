/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Pill } from '../primitives/Pill';

describe('Pill (design-system)', () => {
  it('renders fully-rounded with text', () => {
    render(<Pill>94</Pill>);
    expect(screen.getByText('94')).toHaveClass('rounded-ds-full');
  });
});
