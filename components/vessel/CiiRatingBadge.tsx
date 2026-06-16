import type { CiiRating, CiiSource } from '@/lib/imo/cii-lookup';

interface CiiRatingBadgeProps {
  rating: CiiRating;
  year: number;
  source: CiiSource;
  size?: 'small' | 'medium';
}

const RATING_COLORS: Record<CiiRating, string> = {
  A: 'bg-green-500 text-white',
  B: 'bg-green-300 text-green-900',
  C: 'bg-yellow-400 text-yellow-900',
  D: 'bg-orange-500 text-white',
  E: 'bg-red-500 text-white',
  unknown: 'bg-gray-400 text-white',
};

const SIZE_CLASSES = {
  small: 'text-xs px-1.5 py-0.5',
  medium: 'text-sm px-2 py-1',
};

export function CiiRatingBadge({ rating, year, source, size = 'small' }: CiiRatingBadgeProps) {
  const colorClass = RATING_COLORS[rating];
  const sizeClass = SIZE_CLASSES[size];
  // Both 'estimated' (age/type rule) and 'llm-fallback' (AI) are estimates → asterisk + disclosure.
  const isEstimated = source === 'estimated' || source === 'llm-fallback';
  const label = rating === 'unknown' ? 'CII ?' : isEstimated ? `CII ${rating}*` : `CII ${rating}`;
  let tooltip: string;
  if (source === 'estimated') {
    tooltip = `CII rating ${rating}* (${year}, оценка по возрасту/типу — не официальный рейтинг IMO)`;
  } else if (source === 'llm-fallback') {
    tooltip = `CII rating ${rating}* (${year}, Estimated by AI)`;
  } else {
    tooltip = `CII rating ${rating} (${year}, source: ${source})`;
  }

  return (
    <span
      data-testid="cii-rating-badge"
      className={`inline-flex items-center rounded font-semibold ${colorClass} ${sizeClass}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}
