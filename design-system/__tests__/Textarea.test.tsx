/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '../primitives/Textarea';

describe('Textarea (design-system)', () => {
  it('renders and accepts multiline', async () => {
    render(<Textarea placeholder="notes" />);
    const el = screen.getByPlaceholderText('notes');
    await userEvent.type(el, 'line 1{enter}line 2');
    expect(el).toHaveValue('line 1\nline 2');
  });
});
