import Link from 'next/link';
import type { PriorityLevel } from '@/lib/sailing/priority-classifier';
import { TrafficLight } from './TrafficLight';

const BORDER_CLASSES: Record<PriorityLevel, string> = {
  urgent: 'border-red-400',
  attention: 'border-yellow-400',
  ok: 'border-green-400',
};

interface PriorityCardProps {
  priority: PriorityLevel;
  matchSummary: string;
  keyInsight: string;
  reviewHref: string;
}

export function PriorityCard({ priority, matchSummary, keyInsight, reviewHref }: PriorityCardProps) {
  return (
    <div className={`flex items-start gap-3 p-4 bg-white rounded-lg border-l-4 ${BORDER_CLASSES[priority]} shadow-sm`}>
      <TrafficLight priority={priority} className="shrink-0 mt-0.5 text-lg" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{matchSummary}</p>
        <p className="text-xs text-gray-500 mt-0.5">{keyInsight}</p>
      </div>
      <Link
        href={reviewHref}
        className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
      >
        Review →
      </Link>
    </div>
  );
}
