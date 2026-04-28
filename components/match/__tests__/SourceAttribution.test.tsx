/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SourceAttribution } from '../SourceAttribution';

const baseProps = {
  parsedField: {
    value: '10000 MT',
    sourceQuote: 'cargo of 10000 MT',
    originalEmail: 'We have a cargo of 10000 MT ready for loading at Dubai.',
  },
};

test('renders parsedField value', () => {
  render(<SourceAttribution {...baseProps} />);
  expect(screen.getByText('10000 MT')).toBeInTheDocument();
});

test('renders email body text', () => {
  render(<SourceAttribution {...baseProps} />);
  expect(screen.getByText(/ready for loading at Dubai/)).toBeInTheDocument();
});

test('highlights sourceQuote with <mark> element', () => {
  render(<SourceAttribution {...baseProps} />);
  const mark = document.querySelector('mark');
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe('cargo of 10000 MT');
  expect(mark?.className).toContain('bg-yellow-200');
});

test('missing sourceQuote shows graceful fallback', () => {
  const props = {
    parsedField: {
      value: '5000 MT',
      originalEmail: 'We have cargo ready.',
    },
  };
  render(<SourceAttribution {...props} />);
  expect(screen.getByText(/no source quote/i)).toBeInTheDocument();
});

test('missing originalEmail shows placeholder', () => {
  const props = {
    parsedField: {
      value: '5000 MT',
      sourceQuote: 'cargo',
      originalEmail: '',
    },
  };
  render(<SourceAttribution {...props} />);
  expect(screen.getByText(/original email not available/i)).toBeInTheDocument();
});
