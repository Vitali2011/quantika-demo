'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { detectTextDirection } from '@/lib/i18n/rtl-detect';
import { decodeHtmlEntities } from '@/lib/utils';

export interface Highlight {
  text: string;
  color: string;   // Tailwind bg class, e.g. "bg-blue-200"
  label: string;
}

interface Props {
  body: string;
  highlights: Highlight[];
}

type Span = { start: number; end: number; h: Highlight };
type Node = { span: Span; children: Node[] };

function placeSpan(span: Span, nodes: Node[]): boolean {
  for (const n of nodes) {
    if (span.start >= n.span.start && span.end <= n.span.end) {
      return placeSpan(span, n.children);
    }
    if (span.start < n.span.end && span.end > n.span.start) {
      // partial overlap with already-placed sibling — drop
      return false;
    }
  }
  nodes.push({ span, children: [] });
  return true;
}

function buildTree(body: string, highlights: Highlight[]): Node[] {
  const spans: Span[] = [];
  for (const h of highlights) {
    if (!h.text) continue;
    const start = body.indexOf(h.text);
    if (start === -1) continue;
    spans.push({ start, end: start + h.text.length, h });
  }
  // Outer (longer at same start) processed first so inner nests inside it.
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const roots: Node[] = [];
  for (const span of spans) placeSpan(span, roots);
  return roots;
}

export function EmailBodyViewer({ body, highlights }: Props) {
  const firstMarkRef = useRef<HTMLElement | null>(null);

  // Decode HTML entities first (fix #474), then normalize CRLF → LF.
  // decodeHtmlEntities is safe: no innerHTML, pure string replacement.
  const normalizedBody = decodeHtmlEntities(body).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  useEffect(() => {
    if (window.location.hash === '#highlight' && firstMarkRef.current) {
      firstMarkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const tree = buildTree(normalizedBody, highlights);
  const dir = detectTextDirection(normalizedBody);
  const ctx = { firstAssigned: false };

  const renderRange = (start: number, end: number, nodes: Node[]): ReactNode[] => {
    const result: ReactNode[] = [];
    let cursor = start;
    let key = 0;
    for (const n of nodes) {
      if (cursor < n.span.start) {
        result.push(<span key={`t-${key++}`}>{normalizedBody.slice(cursor, n.span.start)}</span>);
      }
      const isFirst = !ctx.firstAssigned;
      if (isFirst) ctx.firstAssigned = true;
      result.push(
        <mark
          key={`m-${key++}-${n.span.start}`}
          ref={isFirst ? (el) => { firstMarkRef.current = el; } : undefined}
          className={`${n.span.h.color} rounded px-0.5`}
          title={n.span.h.label}
        >
          {renderRange(n.span.start, n.span.end, n.children)}
        </mark>
      );
      cursor = n.span.end;
    }
    if (cursor < end) {
      result.push(<span key={`t-${key++}`}>{normalizedBody.slice(cursor, end)}</span>);
    }
    return result;
  };

  return (
    <pre dir={dir} className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
      {tree.length === 0 ? normalizedBody : renderRange(0, normalizedBody.length, tree)}
    </pre>
  );
}
