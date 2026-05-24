/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../patterns/ModeProvider';
import { ActionsTab } from '../patterns/PaletteTabs/ActionsTab';

describe('ActionsTab', () => {
  it('lists charterer-mode actions', () => {
    render(
      <ModeProvider initial="charterer">
        <ActionsTab query="" onSelect={() => {}} />
      </ModeProvider>,
    );
    expect(screen.getByText(/find vessel/i)).toBeInTheDocument();
  });

  it('lists owner-mode actions', () => {
    render(
      <ModeProvider initial="owner">
        <ActionsTab query="" onSelect={() => {}} />
      </ModeProvider>,
    );
    expect(screen.getByText(/find cargo/i)).toBeInTheDocument();
  });

  it('filters by query', () => {
    render(
      <ModeProvider initial="charterer">
        <ActionsTab query="recap" onSelect={() => {}} />
      </ModeProvider>,
    );
    expect(screen.getByText(/generate recap/i)).toBeInTheDocument();
    expect(screen.queryByText(/find vessel/i)).toBeNull();
  });

  it('shows empty state when no match', () => {
    render(
      <ModeProvider initial="charterer">
        <ActionsTab query="zzznomatch" onSelect={() => {}} />
      </ModeProvider>,
    );
    expect(screen.getByText(/no matching actions/i)).toBeInTheDocument();
  });
});
