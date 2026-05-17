/**
 * @jest-environment jsdom
 *
 * Tests for ExplainDealModal NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED flag guard.
 * Phase 2a — RED tests (impl does not exist yet).
 *
 * Boundary class covered:
 *   Class 5 (switch/dispatch on env flag value): 'true' renders, anything else → null
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock csrf-client so it doesn't fail in jsdom
jest.mock('@/lib/csrf-client', () => ({
  getCsrfToken: jest.fn(() => null),
  csrfFetch: jest.fn(),
}));

import { ExplainDealModal } from '../ExplainDealModal';

describe('ExplainDealModal — NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED flag guard', () => {
  const originalEnv = process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED;

  afterEach(() => {
    // Restore original env value after each test
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = originalEnv;
    }
  });

  it('renders null when NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED is not set', () => {
    delete process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED;
    const { container } = render(<ExplainDealModal matchIndex={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED is false', () => {
    process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = 'false';
    const { container } = render(<ExplainDealModal matchIndex={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders button when NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED is true', () => {
    process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = 'true';
    render(<ExplainDealModal matchIndex={0} />);
    expect(screen.getByTestId('explain-deal-button')).toBeInTheDocument();
  });

  // Boundary: strict match — only lowercase 'true' activates the flag.
  // Deployment systems (Ansible, Helm, Docker Compose) may normalize boolean
  // env vars to 'True', 'TRUE', '1', or ' true '. All treated as disabled.
  // Decision: document strict matching rather than normalize, to prevent
  // accidental activation when the env var is not explicitly set to 'true'.

  it('renders null when NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED is "TRUE" (uppercase)', () => {
    process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = 'TRUE';
    const { container } = render(<ExplainDealModal matchIndex={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED is "1"', () => {
    process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = '1';
    const { container } = render(<ExplainDealModal matchIndex={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED is " true " (whitespace)', () => {
    process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED = ' true ';
    const { container } = render(<ExplainDealModal matchIndex={0} />);
    expect(container.firstChild).toBeNull();
  });
});
