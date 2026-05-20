/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import MorePage from '@/app/more/page';

describe('/more page', () => {
  beforeEach(() => {
    render(React.createElement(MorePage));
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

  it('button is type=submit', () => {
    const button = screen.getByRole('button', { name: /log out/i });
    expect(button).toHaveAttribute('type', 'submit');
  });
});
