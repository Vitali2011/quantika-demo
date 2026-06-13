/**
 * Tests for NavigateTab — verifies that all expected routes are surfaced in the
 * command-palette navigate tab, including the laytime flag gate.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { NavigateTab } from '../NavigateTab';

// next/link renders as <a> in tests via the jest/next mocks
describe('NavigateTab', () => {
  const noOp = () => {};

  describe('with NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED unset', () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED;
    });

    it('renders /clauses link', () => {
      render(<NavigateTab query="" onSelect={noOp} />);
      expect(screen.getByRole('link', { name: /clauses/i })).toBeInTheDocument();
    });

    it('renders /psc link', () => {
      render(<NavigateTab query="" onSelect={noOp} />);
      expect(screen.getByRole('link', { name: /psc/i })).toBeInTheDocument();
    });

    it('renders /commission link', () => {
      render(<NavigateTab query="" onSelect={noOp} />);
      expect(screen.getByRole('link', { name: /commission/i })).toBeInTheDocument();
    });

    it('does NOT render /laytime when flag is unset', () => {
      render(<NavigateTab query="" onSelect={noOp} />);
      expect(screen.queryByRole('link', { name: /laytime/i })).toBeNull();
    });
  });

  describe('with NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED=true', () => {
    const originalEnv = process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED;
    beforeEach(() => {
      process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED = 'true';
    });
    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED = originalEnv;
      }
    });

    it('renders /laytime link when flag is true', () => {
      render(<NavigateTab query="" onSelect={noOp} />);
      expect(screen.getByRole('link', { name: /laytime/i })).toBeInTheDocument();
    });
  });

  describe('query filtering still works', () => {
    it('filters to show only matching routes', () => {
      render(<NavigateTab query="psc" onSelect={noOp} />);
      // PSC should be visible
      expect(screen.getByRole('link', { name: /psc/i })).toBeInTheDocument();
      // Dashboard should not be visible
      expect(screen.queryByRole('link', { name: /dashboard/i })).toBeNull();
    });
  });
});
