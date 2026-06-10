'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { csrfFetch } from '@/lib/csrf-client';
import { parseJsonResponse } from '@/lib/http/parse-json-response';
import { QUOTE_UPDATE_EVENT } from '@/lib/jobs/event-emitter';

export type QuoteJobUiState = 'idle' | 'queued' | 'processing' | 'done' | 'error';

export interface UseQuoteJobResult {
  state: QuoteJobUiState;
  draft: string;
  error: string;
  start: () => Promise<void>;
  retry: () => Promise<void>;
}

const SSE_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 3_000;

/**
 * @param emailId  The cargo email ID to enqueue a quote for.
 * @param onError  Optional callback called synchronously when any error occurs
 *                 (POST failure, SSE error, poll error). Use for toasts so the
 *                 toast fires in the same React update as the error state.
 */
export function useQuoteJob(
  emailId?: string,
  onError?: (msg: string) => void,
  matchId?: string,
): UseQuoteJobResult {
  const [state, setState] = useState<QuoteJobUiState>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  // Stable ref so async callbacks always call the latest onError
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotSseEventRef = useRef(false);
  const isTerminalRef = useRef(false);

  function cleanup() {
    esRef.current?.close();
    esRef.current = null;
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (sseTimeoutRef.current !== null) {
      clearTimeout(sseTimeoutRef.current);
      sseTimeoutRef.current = null;
    }
  }

  useEffect(() => cleanup, []);

  function handleTerminal(newState: 'done' | 'error', result?: string, errorMsg?: string) {
    if (isTerminalRef.current) return;
    isTerminalRef.current = true;
    cleanup();
    if (newState === 'done') {
      setDraft(result ?? '');
    } else {
      const msg = errorMsg ?? 'Quote generation failed — please retry.';
      setError(msg);
      onErrorRef.current?.(msg);
    }
    setState(newState);
  }

  function startPolling(jobId: string) {
    if (pollTimerRef.current !== null) return;
    esRef.current?.close();
    esRef.current = null;

    const doPoll = async () => {
      if (isTerminalRef.current) return;
      try {
        const res = await csrfFetch(
          `/api/ai/draft-quote/status?jobId=${encodeURIComponent(jobId)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: string;
          result?: string;
          error?: string;
        };
        if (data.status === 'done') {
          handleTerminal('done', data.result);
        } else if (data.status === 'error') {
          handleTerminal('error', undefined, data.error);
        } else if (data.status === 'processing') {
          setState(s => (s === 'queued' ? 'processing' : s));
        }
      } catch {
        /* retry next tick */
      }
    };

    doPoll();
    pollTimerRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
  }

  function subscribeToSse(jobId: string) {
    gotSseEventRef.current = false;
    const es = new EventSource('/api/jobs/stream');
    esRef.current = es;

    es.addEventListener(QUOTE_UPDATE_EVENT, (rawEvt: Event) => {
      const e = rawEvt as MessageEvent;
      try {
        const data = JSON.parse(e.data as string) as {
          id: string;
          status: string;
          result?: string;
          error?: string;
        };
        if (data.id !== jobId) return;
        gotSseEventRef.current = true;
        if (data.status === 'processing') {
          setState('processing');
        } else if (data.status === 'done') {
          handleTerminal('done', data.result);
        } else if (data.status === 'error') {
          handleTerminal('error', undefined, data.error);
        }
      } catch {
        /* ignore parse error */
      }
    });

    sseTimeoutRef.current = setTimeout(() => {
      if (!gotSseEventRef.current && !isTerminalRef.current) {
        startPolling(jobId);
      }
    }, SSE_TIMEOUT_MS);
  }

  const start = useCallback(async () => {
    if (!emailId) return;
    cleanup();
    isTerminalRef.current = false;
    gotSseEventRef.current = false;
    setState('queued');
    setDraft('');
    setError('');

    try {
      const body: Record<string, string> = { emailId };
      if (matchId) body.matchId = matchId;
      const res = await csrfFetch('/api/ai/draft-quote', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse<{ jobId: string }>(res);
      subscribeToSse(data.jobId);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to enqueue quote job';
      setError(msg);
      setState('error');
      isTerminalRef.current = true;
      onErrorRef.current?.(msg);
    }
  // subscribeToSse / startPolling close over stable refs — no extra deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId, matchId]);

  const retry = useCallback(async () => {
    cleanup();
    isTerminalRef.current = false;
    setState('idle');
    setDraft('');
    setError('');
    await start();
  }, [start]);

  return { state, draft, error, start, retry };
}
