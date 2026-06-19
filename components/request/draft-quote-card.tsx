'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Copy, Check } from 'lucide-react';
import { csrfFetch } from '@/lib/csrf-client';
import { useToast } from '@/components/ui/toast';
import { parseJsonResponse } from '@/lib/http/parse-json-response';
import { useQuoteJob } from '@/lib/quote-jobs/use-quote-job';

interface DraftQuoteCardProps {
  emailId: string;
  /** DB match id (migration 049) so the worker targets the right cargo item of a
   *  multi-item email and injects the economics block (#W1-3). */
  matchId?: string;
}

export function DraftQuoteCard({ emailId, matchId }: DraftQuoteCardProps) {
  const toast = useToast();
  const {
    state: quoteState,
    draft: quoteDraft,
    error: quoteError,
    start: startQuote,
    retry: retryQuote,
  } = useQuoteJob(emailId, (msg) => toast.error(msg), matchId);
  const [replyDraft, setReplyDraft] = useState('');
  const [loadingReply, setLoadingReply] = useState(false);
  const [copied, setCopied] = useState<'quote' | 'reply' | null>(null);
  const [replyError, setReplyError] = useState('');

  const loadingQuote = quoteState === 'queued' || quoteState === 'processing';

  async function generateReply() {
    setLoadingReply(true);
    setReplyError('');
    try {
      const res = await csrfFetch('/api/ai/draft-reply', {
        method: 'POST',
        body: JSON.stringify({ emailId }),
      });
      const data = await parseJsonResponse<{ draft?: string }>(res);
      setReplyDraft(data.draft ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate reply';
      setReplyError(msg);
      toast.error(msg);
    } finally {
      setLoadingReply(false);
    }
  }

  async function copyToClipboard(text: string, type: 'quote' | 'reply') {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <Button onClick={startQuote} disabled={loadingQuote} variant="default">
          {loadingQuote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Draft Quote
        </Button>
        {quoteState === 'error' && (
          <Button onClick={retryQuote} variant="outline" size="sm">
            Retry
          </Button>
        )}
        {quoteError && quoteState === 'error' && (
          <p className="text-sm text-red-600">{quoteError}</p>
        )}
        <Button onClick={generateReply} disabled={loadingReply} variant="outline">
          {loadingReply ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Ask Client for Missing Info
        </Button>
        {replyError && <p className="text-sm text-red-600">{replyError}</p>}
      </div>

      {quoteDraft && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Draft Quote</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(quoteDraft, 'quote')} aria-label={copied === 'quote' ? 'Copied' : 'Copy quote to clipboard'}>
              {copied === 'quote' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[200px] text-sm font-mono bg-muted rounded p-3 resize-y border-0 focus:ring-2 focus:ring-offset-2 outline-none"
              value={quoteDraft}
              onChange={() => {/* read-only in async flow */}}
            />
          </CardContent>
        </Card>
      )}

      {replyDraft && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Follow-up Request</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(replyDraft, 'reply')} aria-label={copied === 'reply' ? 'Copied' : 'Copy reply to clipboard'}>
              {copied === 'reply' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[160px] text-sm font-mono bg-muted rounded p-3 resize-y border-0 focus:ring-2 focus:ring-offset-2 outline-none"
              value={replyDraft}
              onChange={e => setReplyDraft(e.target.value)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
