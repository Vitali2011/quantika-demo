/**
 * @jest-environment jsdom
 *
 * #574 regression: HelpTab must not crash when API returns non-Answer JSON
 * (e.g. 401 { error: 'No session' } which has no `sources` field).
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HelpTab } from '@/design-system/patterns/PaletteTabs/HelpTab';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HelpTab', () => {
  it('shows prompt when query is short', () => {
    render(<HelpTab query="ab" />);
    expect(screen.getByText(/≥3 chars/)).toBeInTheDocument();
  });

  it('does not crash when API returns 401 (no sources field)', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'No session' }) })
    ) as jest.Mock;

    expect(() => {
      render(<HelpTab query="how to upload" />);
    }).not.toThrow();

    // After async resolution, still no crash
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('renders answer and sources when API returns valid Answer', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          answer: 'Upload via the Processing page.',
          sources: [{ title: 'Quick start', url: '/docs/quickstart' }],
        }),
      })
    ) as jest.Mock;

    render(<HelpTab query="how to upload emails" />);

    await waitFor(() => {
      expect(screen.getByText('Upload via the Processing page.')).toBeInTheDocument();
    });
    expect(screen.getByText('Quick start')).toBeInTheDocument();
  });

  it('renders safely when API returns answer without sources array', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ answer: 'Some answer' }),
      })
    ) as jest.Mock;

    expect(() => {
      render(<HelpTab query="what is quantika" />);
    }).not.toThrow();

    await act(async () => { await Promise.resolve(); });
  });
});
