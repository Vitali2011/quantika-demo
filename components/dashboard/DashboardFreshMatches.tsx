import Link from 'next/link';
import { Card, Pill } from '@/design-system/primitives';

export interface FreshMatchItem {
  score: number;
  matchLevel: string;
  matchReasons: string[];
  id: number;
}

function scoreToPillVariant(score: number): 'success' | 'warn' | 'default' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warn';
  return 'default';
}

interface DashboardFreshMatchesProps {
  matches: FreshMatchItem[];
}

export function DashboardFreshMatches({ matches }: DashboardFreshMatchesProps) {
  const top = matches.slice(0, 5);

  return (
    <section aria-labelledby="fresh-matches-heading">
      <div className="flex items-center justify-between mb-3">
        <h2
          id="fresh-matches-heading"
          className="text-sm font-semibold text-ds-text-muted uppercase tracking-wide"
        >
          ✨ Fresh Matches
        </h2>
        <Link
          href="/matches"
          className="text-xs text-ds-text-muted hover:text-ds-text transition-colors duration-ds-fast"
        >
          See all →
        </Link>
      </div>

      {top.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-ds-text-muted text-center py-2">
            No matches yet — upload emails to discover opportunities.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {top.map((match) => {
            const reason = match.matchReasons[0] || `Match #${match.id}`;
            return (
              <Link
                key={match.id}
                href={`/match/${match.id}`}
                className="block outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 rounded-ds-md"
              >
                <Card padding="sm" interactive>
                  <div className="flex items-center gap-3">
                    <Pill
                      variant={scoreToPillVariant(match.score)}
                      className="shrink-0 tabular-nums"
                    >
                      {match.score}
                    </Pill>
                    <p className="text-sm text-ds-text truncate flex-1">{reason}</p>
                    <span className="text-ds-text-subtle text-sm shrink-0" aria-hidden>
                      →
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
