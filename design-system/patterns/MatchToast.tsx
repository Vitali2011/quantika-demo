'use client';
import { useEffect } from 'react';
import type { NewMatch } from './useLiveJobs';

interface Props {
  match: NewMatch | null;
  onDismiss: () => void;
}

export function MatchToast({ match, onDismiss }: Props) {
  useEffect(() => {
    if (!match) return;
    const tid = setTimeout(onDismiss, 5000);
    return () => clearTimeout(tid);
  }, [match, onDismiss]);

  if (!match) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 bg-green-50 border border-green-300 text-green-900 rounded-ds-md px-4 py-3 shadow-lg flex items-center gap-2"
    >
      <span>✨ Новый match:</span>
      <b>{match.vessel_name ?? `match #${match.match_id}`}</b>
      <span className="text-xs text-green-700">score {match.score}</span>
      <button
        onClick={onDismiss}
        aria-label="dismiss"
        className="ml-2 text-green-700 hover:text-green-900"
      >
        ✕
      </button>
    </div>
  );
}
