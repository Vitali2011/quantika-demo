/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ThemeProvider } from '@/design-system/patterns/ThemeProvider';
import { DarkToggle } from '@/design-system/patterns/DarkToggle';

function withTheme(ui: React.ReactElement) {
  return <ThemeProvider>{ui}</ThemeProvider>;
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  document.cookie = 'quantika_theme=; path=/; max-age=0';
});

describe('ThemeProvider — no html/body wrapping (prod 500 guard)', () => {
  it('does NOT render <html> or <body> elements', () => {
    const { container } = render(
      <ThemeProvider>
        <div data-testid="child">content</div>
      </ThemeProvider>,
    );
    // ThemeProvider must never produce nested html/body — that caused prod 500 via double-html hydration error
    expect(container.querySelector('html')).toBeNull();
    expect(container.querySelector('body')).toBeNull();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

describe('DarkToggle — PI2 behavioral', () => {
  it('click toggle → documentElement gets data-theme=dark and .dark class', async () => {
    const user = userEvent.setup();
    render(withTheme(<DarkToggle />));

    const btn = screen.getByRole('button', { name: /switch to dark mode/i });
    await user.click(btn);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggle back to light removes data-theme and .dark class', async () => {
    const user = userEvent.setup();
    render(withTheme(<DarkToggle />));

    const btn = screen.getByRole('button', { name: /switch to dark mode/i });
    await user.click(btn); // → dark
    await user.click(btn); // → light

    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reload preserves dark — cookie is set and ThemeProvider reads it on mount', async () => {
    document.cookie = 'quantika_theme=dark; path=/; max-age=31536000';

    render(withTheme(<DarkToggle />));
    await act(async () => {});

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('first visit: respects prefers-color-scheme dark', async () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    render(withTheme(<DarkToggle />));
    await act(async () => {});

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
