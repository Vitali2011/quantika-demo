/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../primitives/Input';

describe('Input (design-system)', () => {
  it('renders and accepts typing', async () => {
    render(<Input placeholder="email" />);
    const el = screen.getByPlaceholderText('email');
    await userEvent.type(el, 'a@b.c');
    expect(el).toHaveValue('a@b.c');
  });

  it('forwards aria-invalid for error state', () => {
    render(<Input aria-invalid="true" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});
