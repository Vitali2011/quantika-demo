import type { ConfidenceLevel } from '@/lib/types';

const LEVEL_STYLES: Record<ConfidenceLevel, string> = {
  verified: 'bg-blue-100 text-blue-800',
  inferred: 'bg-yellow-100 text-yellow-800',
  uncertain: 'bg-orange-100 text-orange-800',
  missing: 'bg-gray-100 text-gray-600',
};

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${LEVEL_STYLES[level]}`}>
      Confidence: {level}
    </span>
  );
}
