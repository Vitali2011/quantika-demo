/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Tooltip } from '../primitives/Tooltip';

describe('Tooltip (design-system)', () => {
  it('renders trigger', () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger>hover me</Tooltip.Trigger>
          <Tooltip.Content>tip text</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
    expect(screen.getByText('hover me')).toBeInTheDocument();
  });
});
