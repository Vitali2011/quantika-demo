'use client';

import { useEffect, useRef } from 'react';
import { detectTextDirection } from '@/lib/i18n/rtl-detect';

export interface Highlight {
  text: string;
  color: string;   // Tailwind bg class, e.g. "bg-blue-200"
  label: string;
}

interface Props {
  body: string;
  highlights: Highlight[];
}

function buildSegments(body: string, highlights: Highlight[]) {
  const sorted = [...highlights]
    .filter(h => h.text && body.includes(h.text))
    .sort((a, b) => body.indexOf(a.text) - body.indexOf(b.text));

  if (sorted.length === 0) return [{ text: body, highlight: null as Highlight | null }];

  const segments: Array<{ text: string; highlight: Highlight | null }> = [];
  let remaining = body;

  for (const h of sorted) {
    const idx = remaining.indexOf(h.text);
    if (idx === -1) continue;
    if (idx > 0) segments.push({ text: remaining.slice(0, idx), highlight: null });
    segments.push({ text: h.text, highlight: h });
    remaining = remaining.slice(idx + h.text.length);
  }
  if (remaining) segments.push({ text: remaining, highlight: null });
  return segments;
}

export function EmailBodyViewer({ body, highlights }: Props) {
  const firstMarkRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (window.location.hash === '#highlight' && firstMarkRef.current) {
      firstMarkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const segments = buildSegments(body, highlights);
  const firstHighlightIdx = segments.findIndex(s => s.highlight !== null);
  const dir = detectTextDirection(body);

  return (
    <pre dir={dir} className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
      {segments.map((seg, i) => {
        if (!seg.highlight) return <span key={i}>{seg.text}</span>;
        return (
          <mark
            key={i}
            ref={i === firstHighlightIdx ? (el) => { firstMarkRef.current = el; } : undefined}
            className={`${seg.highlight.color} rounded px-0.5`}
            title={seg.highlight.label}
          >
            {seg.text}
          </mark>
        );
      })}
    </pre>
  );
}
