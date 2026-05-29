'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { csrfFetch } from '@/lib/csrf-client';

interface Props {
  matchDbId: number;
  onSuccess?: () => void;
  className?: string;
}

export function CounterModal({ matchDbId, onSuccess, className }: Props) {
  const [open, setOpen] = useState(false);
  const [counterRate, setCounterRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setError(null);
    setCounterRate('');
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const rate = parseFloat(counterRate);
    if (!counterRate || isNaN(rate)) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/matches/${matchDbId}/counter`, {
        method: 'POST',
        body: JSON.stringify({ counterRate: rate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Request failed (${res.status})`);
        return;
      }
      setOpen(false);
      onSuccess?.();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [counterRate, matchDbId, onSuccess]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        handleClose();
      }
    },
    [handleClose],
  );

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={`w-full justify-start gap-2 text-xs${className ? ` ${className}` : ''}`}
        onClick={handleOpen}
        data-testid="counter-button"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Counter
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleBackdropClick}
          data-testid="counter-backdrop"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="counter-modal-title"
            className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl flex flex-col"
            data-testid="counter-dialog"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 id="counter-modal-title" className="text-base font-semibold text-gray-900">
                Send Counter Offer
              </h2>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                data-testid="counter-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="counter-rate" className="text-sm font-medium text-gray-700">
                  Counter Rate ($/MT)
                </label>
                <input
                  id="counter-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 18.50"
                  value={counterRate}
                  onChange={(e) => setCounterRate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="counter-rate-input"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600" data-testid="counter-error">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button size="sm" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !counterRate}
                data-testid="counter-submit"
              >
                {submitting ? 'Sending…' : 'Send Counter'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
