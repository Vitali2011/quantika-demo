'use client';

import { useState } from 'react';
import { Button, Toast } from '@/design-system/primitives';
import { csrfFetch } from '@/lib/csrf-client';

type ToastState = { variant: 'success' | 'danger'; message: string } | null;

export function RecapGenerateCard() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(variant: 'success' | 'danger', message: string) {
    setToast({ variant, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await csrfFetch('/api/recap/generate', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.message ?? 'Generation failed');
      const count = data.count as number;
      setResult(
        count === 0
          ? 'No threads long enough to recap (need 5+ emails).'
          : `Generated ${count} recap${count !== 1 ? 's' : ''} from your emails.`
      );
      showToast('success', `${count} recap${count !== 1 ? 's' : ''} generated`);
    } catch (err) {
      showToast('danger', err instanceof Error ? err.message : 'Failed to generate recap');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true">✨</span>
        <h2 className="text-sm font-semibold text-ds-text">AI Assist</h2>
        <span className="ml-auto text-xs text-ds-text-muted">Powered by Quantika AI</span>
      </div>
      <textarea
        placeholder="Paste email thread or describe negotiation terms…"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-ds-md border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text placeholder:text-ds-text-muted resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 transition-colors duration-ds-fast"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating…' : 'Generate recap'}
        </Button>
        <Button variant="ghost" size="sm" disabled>
          Send email
        </Button>
      </div>
      {result && (
        <p className="text-xs text-ds-text-muted">{result}</p>
      )}
      <Toast open={toast !== null} variant={toast?.variant ?? 'default'}>
        {toast?.message}
      </Toast>
    </div>
  );
}
