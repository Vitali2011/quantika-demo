/**
 * @jest-environment jsdom
 *
 * TDD: PSC Search Page
 * Tests:
 * 1. Valid IMO → fetch → table
 * 2. Invalid IMO → inline error
 * 3. Feature flag disabled → disabled state (not 404)
 * 4. No results → empty message
 * 5. Loading state during fetch
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PscSearchForm } from '@/components/psc/PscSearchForm';

const mockPscRecords = [
  {
    inspection_date: '2024-01-15',
    port: 'Rotterdam',
    authority: 'paris-mou' as const,
    deficiencies: 3,
    detained: true,
  },
  {
    inspection_date: '2023-11-20',
    port: 'Singapore',
    authority: 'tokyo-mou' as const,
    deficiencies: 0,
    detained: false,
  },
];

describe('PscSearchForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global.fetch as jest.Mock) = jest.fn();
  });

  describe('feature flag disabled', () => {
    it('shows disabled state when NEXT_PUBLIC_PSC_DETENTION_ENABLED is not true', () => {
      const originalEnv = process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED;
      delete process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED;

      render(<PscSearchForm />);

      expect(screen.getByText(/PSC Search not available/i)).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

      process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = originalEnv;
    });
  });

  describe('feature flag enabled', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';
    });

    afterEach(() => {
      delete process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED;
    });

    it('renders IMO input when feature flag is enabled', () => {
      render(<PscSearchForm />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('shows inline error for invalid IMO (less than 7 digits)', async () => {
      render(<PscSearchForm />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '123' } });

      const button = screen.getByRole('button', { name: /search/i });
      fireEvent.click(button);

      expect(screen.getByText(/IMO must be exactly 7 digits/i)).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('shows inline error for invalid IMO (non-digits)', async () => {
      render(<PscSearchForm />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'ABC1234' } });

      const button = screen.getByRole('button', { name: /search/i });
      fireEvent.click(button);

      expect(screen.getByText(/IMO must be exactly 7 digits/i)).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('shows inline error for IMO with more than 7 digits', async () => {
      render(<PscSearchForm />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '12345678' } });

      const button = screen.getByRole('button', { name: /search/i });
      fireEvent.click(button);

      expect(screen.getByText(/IMO must be exactly 7 digits/i)).toBeInTheDocument();
    });

    it('fetches and displays table on valid IMO submit', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPscRecords,
      });

      render(<PscSearchForm />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '1234567' } });

      const button = screen.getByRole('button', { name: /search/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Rotterdam')).toBeInTheDocument();
      });

      // Table headers
      expect(screen.getByText(/inspection date/i)).toBeInTheDocument();
      expect(screen.getByText(/port/i)).toBeInTheDocument();
      expect(screen.getByText(/authority/i)).toBeInTheDocument();
      expect(screen.getByText(/deficiencies/i)).toBeInTheDocument();
      // "Detained" appears in both header and badge — use getAllByText
      expect(screen.getAllByText('Detained').length).toBeGreaterThanOrEqual(1);

      // Row data
      expect(screen.getByText('2024-01-15')).toBeInTheDocument();
      expect(screen.getByText('Rotterdam')).toBeInTheDocument();
      expect(screen.getByText('paris-mou')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      expect(screen.getByText('Singapore')).toBeInTheDocument();
      expect(screen.getByText('Clear')).toBeInTheDocument();

      expect(global.fetch).toHaveBeenCalledWith('/api/vessels/1234567/psc-history');
    });

    it('shows "Detained" badge (red) for detained=true', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockPscRecords[0]],
      });

      render(<PscSearchForm />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '1234567' } });
      fireEvent.click(screen.getByRole('button', { name: /search/i }));

      await waitFor(() => {
        // "Detained" appears in header + badge; check badge specifically by class
        const badges = document.querySelectorAll('.bg-red-100');
        expect(badges.length).toBeGreaterThan(0);
        expect(badges[0].textContent).toBe('Detained');
      });
    });

    it('shows "Clear" badge (green) for detained=false', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockPscRecords[1]],
      });

      render(<PscSearchForm />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '1234567' } });
      fireEvent.click(screen.getByRole('button', { name: /search/i }));

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });
    });

    it('shows no results message when API returns empty array', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      render(<PscSearchForm />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '9999999' } });
      fireEvent.click(screen.getByRole('button', { name: /search/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/No PSC inspections found for IMO 9999999/i),
        ).toBeInTheDocument();
      });
    });

    it('clears validation error when user fixes the IMO and searches again', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPscRecords,
      });

      render(<PscSearchForm />);
      const input = screen.getByRole('textbox');
      const button = screen.getByRole('button', { name: /search/i });

      // First: invalid
      fireEvent.change(input, { target: { value: '123' } });
      fireEvent.click(button);
      expect(screen.getByText(/IMO must be exactly 7 digits/i)).toBeInTheDocument();

      // Fix: valid
      fireEvent.change(input, { target: { value: '1234567' } });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.queryByText(/IMO must be exactly 7 digits/i)).not.toBeInTheDocument();
      });
    });

    it('submits search when Enter is pressed (form submit)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPscRecords,
      });

      render(<PscSearchForm />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '1234567' } });

      fireEvent.submit(input.closest('form')!);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/vessels/1234567/psc-history');
      });
    });
  });
});
