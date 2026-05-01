/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar, QuoteScoreBadge, bandFor } from '../../../extensions/gmail/sidebar';

const mockClarity = (text: string): Promise<number> =>
  new Promise((resolve) =>
    setTimeout(() => {
      const len = text.trim().length;
      if (len === 0) return resolve(0);
      if (len < 50) return resolve(4);
      if (len < 150) return resolve(10);
      if (len < 400) return resolve(15);
      resolve(19);
    }, 10),
  );

describe('bandFor', () => {
  it('maps 0-39 → red', () => {
    expect(bandFor(0)).toBe('red');
    expect(bandFor(39)).toBe('red');
  });
  it('maps 40-69 → amber', () => {
    expect(bandFor(40)).toBe('amber');
    expect(bandFor(69)).toBe('amber');
  });
  it('maps 70-100 → green', () => {
    expect(bandFor(70)).toBe('green');
    expect(bandFor(100)).toBe('green');
  });
});

describe('QuoteScoreBadge: live debounce + render', () => {
  it('shows idle state initially when draft is empty', () => {
    render(<QuoteScoreBadge draft="" debounceMs={50} clarityScorer={mockClarity} />);
    const badge = screen.getByTestId('quote-score-badge');
    expect(badge).toBeTruthy();
  });

  it('renders score after debounce window for a good draft (green band)', async () => {
    const goodDraft = `Dear Charterers,

Cargo: 55,000 mt HSS in bulk
Loading port: SANTOS, BRAZIL
Discharge port: QINGDAO, CHINA
Laycan: 10-20 May 2026
Freight: USD 38.50 /mt FIOST
Demurrage: USD 22,000 PDPR
Despatch: USD 11,000 PDPR
INCOTERMS: CFR Qingdao
Vessel: MV STELLA, 58,000 dwt.

Best regards,
Broker`;
    render(
      <QuoteScoreBadge draft={goodDraft} debounceMs={50} clarityScorer={mockClarity} />,
    );
    await waitFor(
      () => {
        const total = screen.getByTestId('quote-score-total');
        expect(Number(total.textContent)).toBeGreaterThanOrEqual(70);
      },
      { timeout: 1000 },
    );
    const badge = screen.getByTestId('quote-score-badge');
    expect(badge.getAttribute('data-band')).toBe('green');
  });

  it('renders red band for empty/garbage draft', async () => {
    render(
      <QuoteScoreBadge draft="hi" debounceMs={50} clarityScorer={mockClarity} />,
    );
    await waitFor(
      () => {
        const badge = screen.getByTestId('quote-score-badge');
        expect(badge.getAttribute('data-band')).toBe('red');
      },
      { timeout: 1000 },
    );
  });
});

describe('Sidebar integration: typing into compose updates badge', () => {
  it('typing a good draft into compose-mock yields a green badge after debounce', async () => {
    render(<Sidebar debounceMs={50} clarityScorer={mockClarity} />);
    const textarea = screen.getByTestId('compose-mock') as HTMLTextAreaElement;

    const goodDraft = `Dear Charterers,

Cargo: 30,000 mt grain in bulk
Loading port: SANTOS - DURBAN
Laycan: 05-15 June 2026
Freight: USD 32.00 /mt FIOST
Demurrage: USD 18,000 PDPR
Despatch: USD 9,000 PDPR
INCOTERMS: CFR Durban
Vessel: TBN supramax, 55,000 dwt.

Best regards.`;

    act(() => {
      fireEvent.change(textarea, { target: { value: goodDraft } });
    });

    await waitFor(
      () => {
        const total = screen.getByTestId('quote-score-total');
        expect(Number(total.textContent)).toBeGreaterThanOrEqual(70);
      },
      { timeout: 1500 },
    );
    const badge = screen.getByTestId('quote-score-badge');
    expect(badge.getAttribute('data-band')).toBe('green');
    const hints = screen.getByTestId('quote-score-hints');
    expect(hints).toBeTruthy();
  });

  it('debounce coalesces rapid keystrokes — only final text scored', async () => {
    render(<Sidebar debounceMs={80} clarityScorer={mockClarity} />);
    const textarea = screen.getByTestId('compose-mock') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'a' } });
      fireEvent.change(textarea, { target: { value: 'ab' } });
      fireEvent.change(textarea, { target: { value: 'abc' } });
    });
    await waitFor(
      () => {
        // Final draft is too short → red.
        const badge = screen.getByTestId('quote-score-badge');
        expect(badge.getAttribute('data-band')).toBe('red');
      },
      { timeout: 1000 },
    );
  });
});
