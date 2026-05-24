/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from '../primitives/Tabs';

describe('Tabs (design-system)', () => {
  it('switches panels on tab click', async () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List>
          <Tabs.Trigger value="a">A</Tabs.Trigger>
          <Tabs.Trigger value="b">B</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="a">panel A</Tabs.Panel>
        <Tabs.Panel value="b">panel B</Tabs.Panel>
      </Tabs.Root>
    );
    expect(screen.getByText('panel A')).toBeInTheDocument();
    await userEvent.click(screen.getByText('B'));
    expect(screen.getByText('panel B')).toBeInTheDocument();
  });
});
