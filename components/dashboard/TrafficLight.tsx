import type { PriorityLevel } from '@/lib/sailing/priority-classifier';

const ICONS: Record<PriorityLevel, string> = {
  urgent: '🔴',
  attention: '⚠️',
  ok: '✅',
};

interface TrafficLightProps {
  priority: PriorityLevel;
  className?: string;
}

export function TrafficLight({ priority, className }: TrafficLightProps) {
  return (
    <span className={className} aria-label={priority}>
      {ICONS[priority]}
    </span>
  );
}
