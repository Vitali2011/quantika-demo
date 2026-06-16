/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SourceAttributionSection } from '../SourceAttributionSection';

describe('SourceAttributionSection — null value guard (#1021)', () => {
  it('hides a field whose value is null even when sourceText is present (no "null" leak, no [¹])', () => {
    render(
      <SourceAttributionSection
        fields={[
          { label: 'Weight', value: { value: null as unknown as string, confidence: 'uncertain', sourceText: '5.000/5.500mts' } },
        ]}
        originalEmail="5.000/5.500mts bgd Cement"
      />
    );
    // Only field is the null-valued Weight → section renders nothing.
    expect(screen.queryByText(/Source Attribution/i)).toBeNull();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('still renders a field with a real value + sourceText', () => {
    render(
      <SourceAttributionSection
        fields={[
          { label: 'Weight', value: { value: '2720 mt', confidence: 'confirmed', sourceText: '2,720mts' } },
        ]}
        originalEmail="2,720mts steel"
      />
    );
    expect(screen.getByText(/Source Attribution/i)).toBeInTheDocument();
  });
});
