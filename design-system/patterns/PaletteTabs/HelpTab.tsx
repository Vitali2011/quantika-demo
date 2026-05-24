'use client';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/design-system/primitives';

interface Answer { answer: string; sources: { title: string; url: string }[] }

export function HelpTab({ query }: { query: string }) {
  const [data, setData] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- early-return setState legitimate
    if (query.length < 3) { setData(null); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const ctrl = new AbortController();
    fetch('/api/help/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d: Answer) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [query]);

  if (query.length < 3) {
    return <div className="p-4 text-ds-text-subtle text-sm">Type your question (≥3 chars)…</div>;
  }
  if (loading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-ds-text leading-relaxed">{data.answer}</p>
      {data.sources.length > 0 && (
        <div className="text-xs text-ds-text-muted">
          <span className="font-semibold">Sources:</span>{' '}
          {data.sources.map((s, i) => (
            <a key={i} href={s.url} className="text-ds-accent underline mr-2">{s.title}</a>
          ))}
        </div>
      )}
    </div>
  );
}
