/**
 * @jest-environment jsdom
 */
/**
 * Tests for components/match/RouteMapButton.tsx
 * Wave γ, spec-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Mock csrfFetch ───────────────────────────────────────────────────────────

const mockCsrfFetch = jest.fn();
jest.mock('@/lib/csrf-client', () => ({
  csrfFetch: (...args: Parameters<typeof mockCsrfFetch>) => mockCsrfFetch(...args),
}));

// ─── Import component ─────────────────────────────────────────────────────────

import { RouteMapButton } from '../RouteMapButton';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  matchId: 'match-123',
  loadingPort: 'Port Klang',
  dischargePort: 'Jebel Ali',
  origin: 'Singapore Anchorage',
  eta: '2026-05-20',
  enabled: true,
};

function makeOkResponse(imageUrl: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ imageUrl }),
  });
}

function makeErrorResponse(error: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RouteMapButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('feature flag', () => {
    it('renders nothing when enabled=false', () => {
      const { container } = render(<RouteMapButton {...defaultProps} enabled={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when enabled prop is omitted (default false)', () => {
      const { container } = render(
        <RouteMapButton
          matchId="m1"
          loadingPort="PK"
          dischargePort="JA"
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders button when enabled=true', () => {
      render(<RouteMapButton {...defaultProps} />);
      expect(screen.getByTestId('route-map-button')).toBeInTheDocument();
    });
  });

  describe('button appearance', () => {
    it('shows "Generate route visual" label', () => {
      render(<RouteMapButton {...defaultProps} />);
      expect(screen.getByTestId('route-map-button')).toHaveTextContent('Generate route visual');
    });

    it('is enabled by default', () => {
      render(<RouteMapButton {...defaultProps} />);
      expect(screen.getByTestId('route-map-button')).not.toBeDisabled();
    });
  });

  describe('loading state', () => {
    it('disables button while loading', async () => {
      mockCsrfFetch.mockReturnValue(new Promise(() => {})); // never resolves
      render(<RouteMapButton {...defaultProps} />);

      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-button')).toBeDisabled();
      });
    });

    it('shows "Generating..." text while loading', async () => {
      mockCsrfFetch.mockReturnValue(new Promise(() => {}));
      render(<RouteMapButton {...defaultProps} />);

      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-button')).toHaveTextContent('Generating...');
      });
    });
  });

  describe('successful generation', () => {
    it('opens modal with image on success', async () => {
      const imageUrl = 'data:image/png;base64,abc123';
      mockCsrfFetch.mockReturnValue(makeOkResponse(imageUrl));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-modal')).toBeInTheDocument();
      });
      expect(screen.getByTestId('route-map-image')).toHaveAttribute('src', imageUrl);
    });

    it('shows port names in modal header', async () => {
      mockCsrfFetch.mockReturnValue(makeOkResponse('data:image/png;base64,abc'));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-modal')).toBeInTheDocument();
      });
      expect(screen.getByText(/Port Klang/)).toBeInTheDocument();
      expect(screen.getByText(/Jebel Ali/)).toBeInTheDocument();
    });

    it('sends correct request body to API', async () => {
      mockCsrfFetch.mockReturnValue(makeOkResponse('data:image/png;base64,abc'));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(mockCsrfFetch).toHaveBeenCalled());

      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/ai/generate-route-map',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            matchId: 'match-123',
            origin: 'Singapore Anchorage',
            loading_port: 'Port Klang',
            discharge_port: 'Jebel Ali',
            eta: '2026-05-20',
          }),
        })
      );
    });

    it('uses "Unknown" origin when not provided', async () => {
      mockCsrfFetch.mockReturnValue(makeOkResponse('data:image/png;base64,abc'));

      render(
        <RouteMapButton
          matchId="m1"
          loadingPort="PK"
          dischargePort="JA"
          enabled={true}
        />
      );
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(mockCsrfFetch).toHaveBeenCalled());

      const body = JSON.parse(
        (mockCsrfFetch.mock.calls[0] as [string, { body: string }])[1].body
      );
      expect(body.origin).toBe('Unknown');
    });
  });

  describe('modal interaction', () => {
    beforeEach(async () => {
      mockCsrfFetch.mockReturnValue(makeOkResponse('data:image/png;base64,testdata'));
    });

    it('closes modal when close button clicked', async () => {
      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(screen.getByTestId('route-map-modal')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('route-map-close'));
      expect(screen.queryByTestId('route-map-modal')).not.toBeInTheDocument();
    });

    it('closes modal when backdrop clicked', async () => {
      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(screen.getByTestId('route-map-modal-backdrop')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('route-map-modal-backdrop'));
      expect(screen.queryByTestId('route-map-modal')).not.toBeInTheDocument();
    });

    it('does not close modal when image area clicked', async () => {
      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(screen.getByTestId('route-map-modal')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('route-map-modal'));
      expect(screen.getByTestId('route-map-modal')).toBeInTheDocument();
    });

    it('shows download button', async () => {
      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(screen.getByTestId('route-map-download')).toBeInTheDocument());
    });
  });

  describe('error handling', () => {
    it('shows error message on API failure', async () => {
      mockCsrfFetch.mockReturnValue(makeErrorResponse('Rate limit exceeded', 429));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-error')).toBeInTheDocument();
      });
      expect(screen.getByTestId('route-map-error')).toHaveTextContent('Rate limit exceeded');
    });

    it('shows error message when fetch throws', async () => {
      mockCsrfFetch.mockRejectedValue(new Error('Network error'));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-error')).toBeInTheDocument();
      });
      expect(screen.getByTestId('route-map-error')).toHaveTextContent('Network error');
    });

    it('shows error when imageUrl is missing from response', async () => {
      mockCsrfFetch.mockReturnValue(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}), // no imageUrl
        })
      );

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-error')).toBeInTheDocument();
      });
      expect(screen.getByTestId('route-map-error')).toHaveTextContent('No image URL returned');
    });

    it('does not open modal on error', async () => {
      mockCsrfFetch.mockReturnValue(makeErrorResponse('Server error'));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.getByTestId('route-map-error')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('route-map-modal')).not.toBeInTheDocument();
    });

    it('clears previous error on new attempt', async () => {
      mockCsrfFetch
        .mockReturnValueOnce(makeErrorResponse('First error'))
        .mockReturnValueOnce(makeOkResponse('data:image/png;base64,ok'));

      render(<RouteMapButton {...defaultProps} />);
      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => expect(screen.getByTestId('route-map-error')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('route-map-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('route-map-error')).not.toBeInTheDocument();
      });
    });
  });
});
