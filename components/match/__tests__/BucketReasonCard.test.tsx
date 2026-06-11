/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { BucketReasonCard } from '../BucketReasonCard';

test('renders bucket label + reason', () => {
  render(<BucketReasonCard bucketReason={{ bucket: 'lowConfidence',
    reason: 'TCE $4,000/day is below the $5,500/day breakeven for this size.' }} />);
  expect(screen.getByText(/Manual review/i)).toBeInTheDocument();
  expect(screen.getByText(/below the \$5,500\/day breakeven/)).toBeInTheDocument();
});

test('renders nothing when bucketReason absent (pre-this-PR data)', () => {
  const { container } = render(<BucketReasonCard bucketReason={undefined} />);
  expect(container).toBeEmptyDOMElement();
});
