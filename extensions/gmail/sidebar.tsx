/**
 * Gmail sidebar React component with live quote-score badge.
 *
 * Spec β-12: real-time 0-100 score, debounced 250ms, color bands:
 *   0-39  red, 40-69 amber, 70-100 green.
 *
 * The component is self-contained and testable with @testing-library/react.
 * It exposes `<QuoteScoreBadge />` and a higher-level `<Sidebar />` that
 * wraps a textarea (compose-mock) plus the badge. Real Gmail wiring lives
 * in `extensions/gmail/src/sidebar/index.ts` (vanilla DOM); this React
 * surface is the unit-testable seam used by the spec's tests.
 */

import * as React from 'react';
import { scoreQuote, type ClarityScorer, type QuoteScore } from './quote-scorer';
import { debounce } from '../../lib/utils/debounce';

export type ScoreBand = 'red' | 'amber' | 'green';

export function bandFor(total: number): ScoreBand {
  if (total < 40) return 'red';
  if (total < 70) return 'amber';
  return 'green';
}

export const BAND_COLOR: Record<ScoreBand, string> = {
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
};

export interface QuoteScoreBadgeProps {
  draft: string;
  /** Optional injected clarity scorer (LLM/mock). */
  clarityScorer?: ClarityScorer;
  /** Debounce wait in ms (default 250). */
  debounceMs?: number;
}

/**
 * Live score badge. Subscribes to draft changes via prop, debounces the
 * scoring call, and shows a coloured pill plus top-3 hints.
 */
export function QuoteScoreBadge({
  draft,
  clarityScorer,
  debounceMs = 250,
}: QuoteScoreBadgeProps): React.ReactElement {
  const [score, setScore] = React.useState<QuoteScore | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  // Latest-call guard: discard stale results when draft changes mid-flight.
  const seqRef = React.useRef<number>(0);

  const runScore = React.useMemo(
    () =>
      debounce((text: string) => {
        const seq = ++seqRef.current;
        setLoading(true);
        scoreQuote(text, { clarityScorer }).then((s) => {
          if (seq !== seqRef.current) return; // stale
          setScore(s);
          setLoading(false);
        });
      }, debounceMs),
    [clarityScorer, debounceMs],
  );

  React.useEffect(() => {
    runScore(draft);
  }, [draft, runScore]);

  if (score === null) {
    return (
      <div data-testid="quote-score-badge" data-state="idle">
        <span data-testid="quote-score-spinner">{loading ? '…' : '–'}</span>
      </div>
    );
  }

  const band = bandFor(score.total);
  const top3 = score.hints.slice(0, 3);

  return (
    <div
      data-testid="quote-score-badge"
      data-band={band}
      data-state={loading ? 'loading' : 'ready'}
      style={{
        background: BAND_COLOR[band],
        color: '#fff',
        padding: '6px 10px',
        borderRadius: 6,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <strong data-testid="quote-score-total">{score.total}</strong>
      <span> / 100</span>
      <ul data-testid="quote-score-hints" style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
        {top3.map((h, i) => (
          <li key={i} style={{ fontSize: 12 }}>
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SidebarProps {
  initialDraft?: string;
  clarityScorer?: ClarityScorer;
  debounceMs?: number;
}

/**
 * Wrapper sidebar — a textarea (compose-mock) + live QuoteScoreBadge.
 * Real Chrome-extension wiring observes the actual Gmail compose DOM and
 * pumps text into a similar component; that integration lives in the
 * vanilla `src/sidebar/index.ts`.
 */
export function Sidebar({
  initialDraft = '',
  clarityScorer,
  debounceMs = 250,
}: SidebarProps): React.ReactElement {
  const [draft, setDraft] = React.useState<string>(initialDraft);
  return (
    <div data-testid="gmail-sidebar">
      <textarea
        data-testid="compose-mock"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        cols={60}
      />
      <QuoteScoreBadge
        draft={draft}
        clarityScorer={clarityScorer}
        debounceMs={debounceMs}
      />
    </div>
  );
}
