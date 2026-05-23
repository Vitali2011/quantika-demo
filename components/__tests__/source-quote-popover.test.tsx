/**
 * @jest-environment jsdom
 *
 * PI2 — #356: sender email must NOT be duplicated in the SourceQuotePopover footer.
 * The page header already shows "From: <sender>" — the popover footer must not repeat it.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SourceQuotePopover, getContextSnippet } from '../source-quote-popover';

// Mock @base-ui/react/popover so we can inspect rendered content without
// a real browser portal. Render children and popup inline.
jest.mock('@base-ui/react/popover', () => ({
  Popover: {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: ({ children, render: r }: { children: React.ReactNode; render?: React.ReactElement }) =>
      r ? React.cloneElement(r, {}, children) : <span>{children}</span>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Positioner: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Popup: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}));

const baseProps = {
  sourceText: 'steel coils',
  emailBody: 'Please ship 10,000 MT steel coils from Constanta.',
  emailDate: '2026-04-05T13:50:02.000Z',
  emailSubject: 'FW: cargo inquiry',
  confidence: 'confirmed' as const,
  label: 'Cargo',
};

describe('SourceQuotePopover — no duplicate sender (fix #356)', () => {
  it('does NOT render "From:" text in the popover', () => {
    const { queryByText, container } = render(
      <SourceQuotePopover {...baseProps}>
        <span>steel coils</span>
      </SourceQuotePopover>,
    );
    // "From:" should not appear anywhere in the rendered popover
    expect(queryByText(/From:/i)).toBeNull();
    expect(container.textContent).not.toMatch(/From:/i);
  });

  it('still renders Date and Subject in the popover footer', () => {
    const { container } = render(
      <SourceQuotePopover {...baseProps}>
        <span>steel coils</span>
      </SourceQuotePopover>,
    );
    expect(container.textContent).toContain('Date:');
    expect(container.textContent).toContain('Subject:');
    expect(container.textContent).toContain('FW: cargo inquiry');
  });

  it('renders the source text highlight', () => {
    const { container } = render(
      <SourceQuotePopover {...baseProps}>
        <span>steel coils</span>
      </SourceQuotePopover>,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('steel coils');
  });
});

describe('getContextSnippet', () => {
  it('returns lines around the source text', () => {
    const body = 'Line A\nLine B with steel coils here\nLine C';
    const snippet = getContextSnippet(body, 'steel coils');
    expect(snippet).toContain('Line B with steel coils here');
    expect(snippet).toContain('Line A');
    expect(snippet).toContain('Line C');
  });

  it('returns first 300 chars when sourceText not found', () => {
    const body = 'x'.repeat(500);
    const snippet = getContextSnippet(body, 'missing text');
    expect(snippet.length).toBe(300);
  });
});
