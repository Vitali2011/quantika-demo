'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Copy, Check } from 'lucide-react';
import type { RecapPoint } from '@/lib/types';

interface RecapActionsProps {
  pendingPoints: RecapPoint[];
}

export function RecapActions({ pendingPoints }: RecapActionsProps) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateFollowUp() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingItems: pendingPoints }),
      });
      const data = await res.json();
      setDraft(data.draft || '');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (pendingPoints.length === 0) return null;

  return (
    <div className="space-y-4">
      <Button onClick={generateFollowUp} disabled={loading} variant="outline">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Draft Follow-up on Pending Items
      </Button>
      {draft && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Follow-up Draft</CardTitle>
            <Button size="sm" variant="ghost" onClick={copyToClipboard} aria-label={copied ? 'Copied' : 'Copy to clipboard'}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[160px] text-sm font-mono bg-muted rounded p-3 resize-y border-0 focus:ring-2 focus:ring-offset-2 outline-none"
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
