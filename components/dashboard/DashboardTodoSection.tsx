import Link from 'next/link';
import { Card, Pill, Badge } from '@/design-system/primitives';
import type { PriorityLevel } from '@/lib/sailing/priority-classifier';

export interface TodoCard {
  priority: PriorityLevel;
  matchSummary: string;
  keyInsight: string;
  href: string;
}

const PRIORITY_PILL: Record<PriorityLevel, 'danger' | 'warn' | 'success'> = {
  urgent: 'danger',
  attention: 'warn',
  ok: 'success',
};

const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  urgent: 'Urgent',
  attention: 'Review',
  ok: 'OK',
};

const VISIBLE_LIMIT = 5;

interface DashboardTodoSectionProps {
  cards: TodoCard[];
}

export function DashboardTodoSection({ cards }: DashboardTodoSectionProps) {
  const visible = cards.slice(0, VISIBLE_LIMIT);

  return (
    <section aria-labelledby="todo-heading">
      <div className="flex items-center justify-between mb-3">
        <h2
          id="todo-heading"
          className="text-sm font-semibold text-ds-text-muted uppercase tracking-wide"
        >
          🎯 To do today
        </h2>
        <div className="flex items-center gap-2">
          {cards.length > 0 && <Badge variant="outline">{cards.length}</Badge>}
          {cards.length > VISIBLE_LIMIT && (
            <Link
              href="/matches"
              className="text-xs text-ds-text-muted hover:text-ds-text transition-colors duration-ds-fast"
            >
              See all →
            </Link>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-ds-text-muted text-center py-2">
            All clear — no urgent actions right now.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((card, i) => (
            <Link
              key={i}
              href={card.href}
              className="block outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 rounded-ds-md"
            >
              <Card padding="sm" interactive>
                <div className="flex items-start gap-3">
                  <Pill variant={PRIORITY_PILL[card.priority]} className="mt-0.5 shrink-0">
                    {PRIORITY_LABEL[card.priority]}
                  </Pill>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ds-text truncate">
                      {card.matchSummary}
                    </p>
                    <p className="text-xs text-ds-text-muted mt-0.5">{card.keyInsight}</p>
                  </div>
                  <span className="text-ds-text-subtle text-sm shrink-0" aria-hidden>
                    →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
