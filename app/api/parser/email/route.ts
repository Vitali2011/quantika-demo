import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { callAiJson } from '@/lib/ai-provider';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import { parseCargoAIResponse, type RawCargoItem } from '@/lib/parsing/parse-cargo-ai';
import { PARSE_CARGO_SCHEMA } from '@/lib/schemas';
import { cfValue } from '@/lib/types';
import { parserEmailRateLimiter } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const authResult = requireSession(req);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  const { allowed, retryAfterMs } = parserEmailRateLimiter.check(sessionId);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  const body = await req.json().catch(() => ({})) as { text?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim() : null;

  if (!text || text.length < 20) {
    return NextResponse.json({ error: 'text must be ≥20 chars' }, { status: 400 });
  }
  if (text.length > 50_000) {
    return NextResponse.json({ error: 'text too long' }, { status: 400 });
  }

  let result: RawCargoItem | null;
  try {
    result = await callAiJson<RawCargoItem>(
      'PARSE_CARGO',
      CARGO_INQUIRY_PARSER_PROMPT,
      text,
      {
        timeoutMs: 30_000,
        responseSchema: PARSE_CARGO_SCHEMA,
        temperature: 0,
      },
    );
  } catch {
    return NextResponse.json({ error: 'parse failed' }, { status: 500 });
  }

  if (!result) return NextResponse.json({ parsed: null });

  const items = parseCargoAIResponse(JSON.stringify(result), 'paste');
  const item = items[0] ?? null;

  if (!item) return NextResponse.json({ parsed: null });

  return NextResponse.json({
    parsed: {
      cargo_type: item.cargoType !== 'OTHER' ? item.cargoType.toLowerCase() : null,
      load_port: cfValue(item.originPort),
      discharge_port: cfValue(item.destinationPort),
      laycan: item.laycan ?? null,
    },
  });
}
