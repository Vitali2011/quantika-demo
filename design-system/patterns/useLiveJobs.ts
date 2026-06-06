'use client';
import { useEffect, useState, useCallback } from 'react';

export interface LiveJob {
  id: string;
  status: string;
  progress_percent: number;
  current_step?: string;
  email_subject?: string;
  from?: string;
}

export interface NewMatch {
  match_id: string;
  score: number;
  vessel_name?: string;
  cargo_summary?: string;
  createdAt: number;
}

export function useLiveJobs() {
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [latestMatch, setLatestMatch] = useState<NewMatch | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let es: EventSource | null = null;
    let retryDelay = 1000;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      es = new EventSource('/api/jobs/stream');

      es.addEventListener('job-update', (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as LiveJob;
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === data.id);
          if (idx === -1) return [...prev, data];
          const next = [...prev];
          next[idx] = data;
          return next;
        });
      });

      es.addEventListener('match-created', (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as Omit<NewMatch, 'createdAt'>;
        setLatestMatch((prev) => {
          if (prev?.match_id === data.match_id) return prev;
          return { ...data, createdAt: Date.now() };
        });
      });

      es.onerror = () => {
        es?.close();
        es = null;
        retryDelay = Math.min(retryDelay * 2, 30_000);
        retryTimer = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);

  const dismissMatch = useCallback(() => setLatestMatch(null), []);

  return { jobs, latestMatch, dismissMatch };
}
