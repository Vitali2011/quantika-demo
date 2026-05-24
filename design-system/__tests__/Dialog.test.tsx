/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Dialog } from '../primitives/Dialog';

describe('Dialog (design-system)', () => {
  it('renders content when open', () => {
    render(
      <Dialog.Root open>
        <Dialog.Content>
          <Dialog.Title>Confirm</Dialog.Title>
          <Dialog.Description>Are you sure?</Dialog.Description>
        </Dialog.Content>
      </Dialog.Root>
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});
