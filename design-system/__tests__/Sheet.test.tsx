/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Sheet } from '../primitives/Sheet';

describe('Sheet (design-system)', () => {
  it('renders content when open', () => {
    render(
      <Sheet.Root open>
        <Sheet.Content>
          <div>sheet body</div>
        </Sheet.Content>
      </Sheet.Root>
    );
    expect(screen.getByText('sheet body')).toBeInTheDocument();
  });
});
