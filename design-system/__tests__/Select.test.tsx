/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Select } from '../primitives/Select';

describe('Select (design-system)', () => {
  it('renders trigger with placeholder', () => {
    render(
      <Select.Root>
        <Select.Trigger placeholder="Choose port" />
        <Select.Content>
          <Select.Item value="cons">Constanta</Select.Item>
          <Select.Item value="alg">Algeciras</Select.Item>
        </Select.Content>
      </Select.Root>
    );
    expect(screen.getByText(/choose port/i)).toBeInTheDocument();
  });
});
