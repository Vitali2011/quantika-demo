/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeProvider } from '../ModeProvider';
import { ModeSwitcher } from '../ModeSwitcher';

describe('ModeSwitcher', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof global.fetch;
  });

  it('renders both modes, active=charterer initially', () => {
    render(<ModeProvider initial="charterer"><ModeSwitcher /></ModeProvider>);
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /owner/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders both modes, active=owner when initial=owner', () => {
    render(<ModeProvider initial="owner"><ModeSwitcher /></ModeProvider>);
    expect(screen.getByRole('button', { name: /owner/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking owner toggles mode', () => {
    render(<ModeProvider initial="charterer"><ModeSwitcher /></ModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /owner/i }));
    expect(screen.getByRole('button', { name: /owner/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking charterer from owner reverts', () => {
    render(<ModeProvider initial="owner"><ModeSwitcher /></ModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /charterer/i }));
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
