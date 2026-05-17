/**
 * @jest-environment jsdom
 *
 * Tests for ExplainDealModal — γv-11
 * Verifies: trigger button, loading state, error state, result rendering,
 * close behavior, EN/AR language support, backdrop click.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExplainDealModal } from '../ExplainDealModal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/csrf-client', () => ({
  getCsrfToken: jest.fn(() => 'test-csrf-token'),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchSuccess(sections: { heading: string; content: string }[], language = 'en') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      sections,
      language,
      model: 'gemini-2.5-pro',
    }),
  });
}

function mockFetchError(status: number, body: object) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  });
}

function mockFetchNetworkError() {
  mockFetch.mockRejectedValueOnce(new Error('Network failure'));
}

const EN_SECTIONS = [
  { heading: 'Market Context', content: 'Steel demand is strong in Dubai.' },
  { heading: 'Deal Rationale', content: 'DWT matches cargo within 12%.' },
  { heading: 'Key Risks', content: 'Port congestion at Singapore.' },
  { heading: 'Recommended Next Steps', content: 'Contact vessel owners immediately.' },
];

const AR_SECTIONS = [
  { heading: 'سياق السوق', content: 'الطلب على الصلب قوي في دبي.' },
  { heading: 'مبررات الصفقة', content: 'حمولة السفينة مناسبة للبضاعة.' },
  { heading: 'المخاطر الرئيسية', content: 'ازدحام ميناء سنغافورة.' },
  { heading: 'الخطوات التالية الموصى بها', content: 'تواصل مع ملاك السفينة.' },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExplainDealModal', () => {
  const originalExplainFlag = process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    // Enable client-side guard for all existing tests (guard added in Fix 1)
    process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalExplainFlag === undefined) {
      delete process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = originalExplainFlag;
    }
  });

  // ── Trigger button ─────────────────────────────────────────────────────────

  it('renders the trigger button with "Explain this deal" text in EN', () => {
    render(<ExplainDealModal matchIndex={0} />);
    expect(screen.getByTestId('explain-deal-button')).toBeInTheDocument();
    expect(screen.getByText('Explain this deal')).toBeInTheDocument();
  });

  it('renders Arabic trigger text when language=ar', () => {
    render(<ExplainDealModal matchIndex={0} language="ar" />);
    expect(screen.getByText('اشرح هذه الصفقة')).toBeInTheDocument();
  });

  it('modal is not visible initially', () => {
    render(<ExplainDealModal matchIndex={0} />);
    expect(screen.queryByTestId('explain-deal-dialog')).not.toBeInTheDocument();
  });

  // ── Opening modal + loading state ──────────────────────────────────────────

  it('shows loading spinner after clicking the button', async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    expect(screen.getByTestId('explain-deal-loading')).toBeInTheDocument();
  });

  it('shows dialog after clicking the button', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    expect(screen.getByTestId('explain-deal-dialog')).toBeInTheDocument();
  });

  it('fetch is called with correct matchIndex and language', async () => {
    mockFetchSuccess(EN_SECTIONS);
    render(<ExplainDealModal matchIndex={3} language="en" />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/ai/explain-deal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ matchIndex: 3, language: 'en' }),
      }),
    );
  });

  // ── Result rendering ───────────────────────────────────────────────────────

  it('renders 4 sections after successful fetch', async () => {
    mockFetchSuccess(EN_SECTIONS);
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => expect(screen.getByTestId('explain-deal-result')).toBeInTheDocument());
    expect(screen.getByText('Market Context')).toBeInTheDocument();
    expect(screen.getByText('Deal Rationale')).toBeInTheDocument();
    expect(screen.getByText('Key Risks')).toBeInTheDocument();
    expect(screen.getByText('Recommended Next Steps')).toBeInTheDocument();
  });

  it('renders section content text', async () => {
    mockFetchSuccess(EN_SECTIONS);
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-result'));
    expect(screen.getByText('Steel demand is strong in Dubai.')).toBeInTheDocument();
    expect(screen.getByText('Contact vessel owners immediately.')).toBeInTheDocument();
  });

  it('renders model attribution', async () => {
    mockFetchSuccess(EN_SECTIONS);
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-result'));
    expect(screen.getByText(/gemini-2\.5-pro/i)).toBeInTheDocument();
  });

  // ── Arabic / RTL ───────────────────────────────────────────────────────────

  it('renders Arabic sections when language=ar', async () => {
    mockFetchSuccess(AR_SECTIONS, 'ar');
    render(<ExplainDealModal matchIndex={0} language="ar" />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-result'));
    expect(screen.getByText('سياق السوق')).toBeInTheDocument();
    expect(screen.getByText('مبررات الصفقة')).toBeInTheDocument();
    expect(screen.getByText('المخاطر الرئيسية')).toBeInTheDocument();
    expect(screen.getByText('الخطوات التالية الموصى بها')).toBeInTheDocument();
  });

  it('sets dir=rtl on dialog when language=ar', async () => {
    mockFetchSuccess(AR_SECTIONS, 'ar');
    render(<ExplainDealModal matchIndex={0} language="ar" />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-dialog'));
    const dialog = screen.getByTestId('explain-deal-dialog');
    expect(dialog).toHaveAttribute('dir', 'rtl');
  });

  it('sets dir=ltr on dialog when language=en', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} language="en" />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    const dialog = screen.getByTestId('explain-deal-dialog');
    expect(dialog).toHaveAttribute('dir', 'ltr');
  });

  // ── Error states ───────────────────────────────────────────────────────────

  it('shows error message on feature_disabled (403)', async () => {
    mockFetchError(403, { error: 'feature_disabled' });
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-error'));
    expect(screen.getByText(/EXPLAIN_DEAL_ENABLED/)).toBeInTheDocument();
  });

  it('shows timeout error message on 504', async () => {
    mockFetchError(504, { error: 'ai_timeout', message: 'AI explanation timed out — please retry' });
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-error'));
    expect(screen.getByText(/timed out/i)).toBeInTheDocument();
  });

  it('shows network error message on fetch failure', async () => {
    mockFetchNetworkError();
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-error'));
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('shows "Try again" button on error', async () => {
    mockFetchError(500, { message: 'Internal error' });
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-error'));
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries fetch when "Try again" is clicked', async () => {
    mockFetchError(500, { message: 'Server error' });
    mockFetchSuccess(EN_SECTIONS); // second call succeeds
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-error'));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => screen.getByTestId('explain-deal-result'));
    expect(screen.getByText('Market Context')).toBeInTheDocument();
  });

  // ── Close behavior ─────────────────────────────────────────────────────────

  it('closes the modal when close button is clicked', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    expect(screen.getByTestId('explain-deal-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('explain-deal-close'));
    expect(screen.queryByTestId('explain-deal-dialog')).not.toBeInTheDocument();
  });

  it('closes the modal when Escape key is pressed', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('explain-deal-dialog')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the dialog (backdrop)', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    const backdrop = screen.getByTestId('explain-deal-backdrop');
    // Click on the backdrop (not the dialog itself)
    fireEvent.click(backdrop);
    expect(screen.queryByTestId('explain-deal-dialog')).not.toBeInTheDocument();
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('dialog has role=dialog and aria-modal=true', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('dialog title is labelled by aria-labelledby', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    const dialog = screen.getByRole('dialog');
    const labelledById = dialog.getAttribute('aria-labelledby');
    expect(labelledById).toBeTruthy();
    expect(document.getElementById(labelledById!)).toBeInTheDocument();
  });

  // ── No duplicate fetch on re-open ──────────────────────────────────────────

  it('does not re-fetch when modal is re-opened with existing result', async () => {
    mockFetchSuccess(EN_SECTIONS);
    render(<ExplainDealModal matchIndex={0} />);
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-result'));
    fireEvent.click(screen.getByTestId('explain-deal-close'));
    // Re-open
    fireEvent.click(screen.getByTestId('explain-deal-button'));
    await waitFor(() => screen.getByTestId('explain-deal-result'));
    // fetch should have been called only once
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
