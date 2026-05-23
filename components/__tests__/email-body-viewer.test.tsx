/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmailBodyViewer } from '../email-body-viewer';

describe('EmailBodyViewer — CRLF normalisation (fix #357, hydration #418)', () => {
  it('renders CRLF body without \\r characters in the DOM text', () => {
    const crlfBody = 'Hello\r\nWorld\r\nFrom: sender@example.com';
    const { container } = render(
      <EmailBodyViewer body={crlfBody} highlights={[]} />,
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    // After normalisation, no carriage-return characters should remain in DOM text
    expect(pre!.textContent).not.toContain('\r');
    // Content should still be there
    expect(pre!.textContent).toContain('Hello');
    expect(pre!.textContent).toContain('World');
  });

  it('renders body with only LF unchanged', () => {
    const lfBody = 'Hello\nWorld';
    const { container } = render(
      <EmailBodyViewer body={lfBody} highlights={[]} />,
    );
    const pre = container.querySelector('pre');
    expect(pre!.textContent).toBe('Hello\nWorld');
  });

  it('highlight positions match after CRLF normalisation', () => {
    // body has CRLF, sourceText uses LF — indexOf must still find the text
    const body = 'Line one\r\nLine two\r\nCargo: steel coils';
    const { container } = render(
      <EmailBodyViewer
        body={body}
        highlights={[{ text: 'steel coils', color: 'bg-blue-200', label: 'Cargo' }]}
      />,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('steel coils');
  });
});

describe('EmailBodyViewer — RTL auto-detection (stab/rtl-per-content)', () => {
  it('renders <pre dir="rtl"> for Arabic body', () => {
    const arabicBody =
      'السادة الكرام، نرجو تقديم عرض أسعار للشحنة التالية: ميناء التحميل صحار، سلطنة عُمان';
    const { container } = render(
      <EmailBodyViewer body={arabicBody} highlights={[]} />,
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute('dir')).toBe('rtl');
  });

  it('renders <pre dir="ltr"> for English body', () => {
    const englishBody =
      'Hello, please find attached the quote request for cargo loading from Constanta to Lagos.';
    const { container } = render(
      <EmailBodyViewer body={englishBody} highlights={[]} />,
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute('dir')).toBe('ltr');
  });

  it('renders <pre dir="rtl"> for Hebrew body', () => {
    const hebrewBody = 'שלום, אנא קבלו את הצעת המחיר עבור משלוח מנמל חיפה לפיראוס';
    const { container } = render(
      <EmailBodyViewer body={hebrewBody} highlights={[]} />,
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute('dir')).toBe('rtl');
  });
});
