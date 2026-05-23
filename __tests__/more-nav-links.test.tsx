/**
 * H-4 — /upgrade discoverable from /more
 * H-5 — /more page has minimum set of links
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import MorePage from '@/app/more/page';

describe('/more page — H-4 upgrade link', () => {
  beforeEach(() => {
    render(React.createElement(MorePage));
  });

  it('renders a link to /upgrade', () => {
    const link = screen.getByRole('link', { name: /upgrade/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/upgrade');
  });
});

describe('/more page — H-5 navigation links', () => {
  beforeEach(() => {
    render(React.createElement(MorePage));
  });

  it('renders a nav landmark', () => {
    expect(screen.getByRole('navigation', { name: /more navigation/i })).toBeInTheDocument();
  });

  it('renders a link to /dashboard', () => {
    const link = screen.getByRole('link', { name: /dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders a log out button', () => {
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('logout button is inside a form POSTing to /api/auth/logout', () => {
    const button = screen.getByRole('button', { name: /log out/i });
    const form = button.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('method', 'POST');
    expect(form).toHaveAttribute('action', '/api/auth/logout');
  });

  it('Help & FAQ entry is present', () => {
    expect(screen.getByText(/Help.*FAQ|FAQ.*Help/i)).toBeInTheDocument();
  });
});
