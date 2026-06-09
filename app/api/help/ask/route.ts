import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const authResult = requireSession(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json().catch(() => ({})) as { query?: unknown };
  const { query } = body;
  if (typeof query !== 'string' || query.trim().length < 3) {
    return NextResponse.json({ error: 'query must be ≥3 chars' }, { status: 400 });
  }

  // Forward to Knowledge RAG if available, else return canned answer
  try {
    const rag = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/knowledge/ask`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: req.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({ query }),
      },
    );
    if (rag.ok) {
      const data = await rag.json() as { answer?: string; text?: string; sources?: unknown[] };
      return NextResponse.json({ answer: data.answer ?? data.text ?? '', sources: data.sources ?? [] });
    }
  } catch { /* fall through to canned answer */ }

  return NextResponse.json({
    answer: 'Quantika can parse emails, calculate TCE, and generate voyage recaps. A detailed guide is coming soon in docs.',
    sources: [{ title: 'Quick start', url: '/docs/quickstart' }],
  });
}
