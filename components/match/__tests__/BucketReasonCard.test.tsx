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

test('main bucket reads as a list partition, not a quality verdict (#1003)', () => {
  // The bucket label must not contain the word "Match" — it is conflated with the
  // quality-tier pill ("Possible Match") and reads as a contradiction (#1003).
  render(<BucketReasonCard bucketReason={{ bucket: 'main',
    reason: 'Passed all hard filters and economic thresholds.' }} />);
  expect(screen.getByText('Main list')).toBeInTheDocument();
  expect(screen.queryByText(/Main match/i)).not.toBeInTheDocument();
});

test('renders nothing when bucketReason absent (pre-this-PR data)', () => {
  const { container } = render(<BucketReasonCard bucketReason={undefined} />);
  expect(container).toBeEmptyDOMElement();
});
