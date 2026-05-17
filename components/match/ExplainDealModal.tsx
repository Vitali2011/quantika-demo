'use client';

/**
 * ExplainDealModal — γv-11
 *
 * Modal triggered by "Explain this deal" button on the match detail page.
 * Calls /api/ai/explain-deal, shows loading state, renders 4-section narrative.
 * Supports EN and AR (RTL) output.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCsrfToken } from '@/lib/csrf-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Language = 'en' | 'ar';

interface DealSection {
  heading: string;
  content: string;
}

interface ExplainDealResult {
  sections: DealSection[];
  language: Language;
  model: string;
}

interface Props {
  /** Index into session.matches[] — passed to the API */
  matchIndex: number;
  /** Language for the narrative. Default: 'en' */
  language?: Language;
  /** Optional extra CSS classes on the trigger button */
  className?: string;
}

// ─── Section icon mapping ─────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
  // English headers
  'Market Context': '🌐',
  'Deal Rationale': '⚖️',
  'Key Risks': '⚠️',
  'Recommended Next Steps': '➡️',
  // Arabic headers
  'سياق السوق': '🌐',
  'مبررات الصفقة': '⚖️',
  'المخاطر الرئيسية': '⚠️',
  'الخطوات التالية الموصى بها': '➡️',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ExplainDealModal({ matchIndex, language = 'en', className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainDealResult | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isRtl = language === 'ar';

  const fetchExplanation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/ai/explain-deal', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ matchIndex, language }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && body.error === 'feature_disabled') {
          setError('This feature is not enabled. Set EXPLAIN_DEAL_ENABLED=true to activate it.');
        } else if (res.status === 504) {
          setError('AI explanation timed out. Please try again.');
        } else {
          setError(body.message ?? `Request failed (${res.status})`);
        }
        return;
      }

      const data: ExplainDealResult = await res.json();
      setResult(data);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [matchIndex, language]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    // Only fetch if we don't have a result yet
    if (!result) {
      fetchExplanation();
    }
  }, [result, fetchExplanation]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleRetry = useCallback(() => {
    setResult(null);
    setError(null);
    fetchExplanation();
  }, [fetchExplanation]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        handleClose();
      }
    },
    [handleClose],
  );

  if (process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED !== 'true') return null;

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className={cn('gap-1.5', className)}
        data-testid="explain-deal-button"
      >
        <span>💡</span>
        <span>{language === 'ar' ? 'اشرح هذه الصفقة' : 'Explain this deal'}</span>
      </Button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleBackdropClick}
          data-testid="explain-deal-backdrop"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="explain-deal-title"
            dir={isRtl ? 'rtl' : 'ltr'}
            className={cn(
              'relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-2xl',
              'flex flex-col',
            )}
            data-testid="explain-deal-dialog"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2
                id="explain-deal-title"
                className="text-base font-semibold text-gray-900"
              >
                {language === 'ar' ? '💡 تحليل الصفقة' : '💡 Deal Analysis'}
              </h2>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                data-testid="explain-deal-close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 px-6 py-4">
              {/* Loading state */}
              {loading && (
                <div
                  className="flex flex-col items-center justify-center py-12 gap-3"
                  data-testid="explain-deal-loading"
                >
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
                  <p className="text-sm text-gray-500">
                    {language === 'ar'
                      ? 'جاري تحليل الصفقة...'
                      : 'Analyzing this deal with Gemini Pro…'}
                  </p>
                </div>
              )}

              {/* Error state */}
              {!loading && error && (
                <div
                  className="flex flex-col items-center gap-3 py-8"
                  data-testid="explain-deal-error"
                >
                  <p className="text-sm text-red-600 text-center">{error}</p>
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    {language === 'ar' ? 'إعادة المحاولة' : 'Try again'}
                  </Button>
                </div>
              )}

              {/* Result — 4 sections */}
              {!loading && !error && result && (
                <div
                  className="space-y-5"
                  data-testid="explain-deal-result"
                >
                  {result.sections.map((section) => (
                    <div key={section.heading} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <span>{SECTION_ICONS[section.heading] ?? '📌'}</span>
                        <span>{section.heading}</span>
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                        {section.content || (
                          <span className="italic text-gray-400">
                            {language === 'ar' ? 'لا توجد بيانات' : 'No data available'}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}

                  {/* Model attribution */}
                  <p className="text-xs text-gray-400 text-right">
                    {language === 'ar' ? `النموذج: ${result.model}` : `Model: ${result.model}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
