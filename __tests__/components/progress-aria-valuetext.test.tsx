/**
 * @jest-environment jsdom
 *
 * TDD: Bug #291 — Progress component must emit aria-valuetext without a space
 * before %. base-ui uses Intl.NumberFormat(style:'percent') which in non-en
 * locales formats as "0 %" (non-breaking space). We override getAriaValueText
 * in the Progress wrapper to guarantee "0%" format.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Progress } from '@/components/ui/progress';

describe('Progress aria-valuetext format (Bug #291)', () => {
  it('aria-valuetext at value=0 matches /^\\d+%$/ — no space before %', () => {
    render(<Progress value={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuetext');
    expect(bar.getAttribute('aria-valuetext')).toMatch(/^\d+%$/);
  });

  it('aria-valuetext at value=75 is "75%" not "75 %"', () => {
    render(<Progress value={75} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toBe('75%');
  });

  it('aria-valuetext at value=100 is "100%"', () => {
    render(<Progress value={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toBe('100%');
  });

  it('aria-valuetext when value=null is "indeterminate progress"', () => {
    render(<Progress value={null} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toBe('indeterminate progress');
  });
});
