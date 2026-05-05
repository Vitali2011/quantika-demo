/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmailBodyViewer } from '../email-body-viewer';

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
