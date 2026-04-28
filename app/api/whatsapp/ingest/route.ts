import { NextRequest, NextResponse } from 'next/server';
import { parseForwardedMessage } from '@/lib/whatsapp/forward-parser';
import { getWhatsAppClient } from '@/lib/whatsapp/client';
import type { WhatsAppIncomingMessage } from '@/lib/whatsapp/types';

const INTERNAL_TOKEN = process.env.QUANTIKA_INTERNAL_TOKEN ?? '';

interface IngestBody {
  phone: string;
  messageId: string;
  type: 'text' | 'image' | 'document' | 'audio';
  content: string | { mediaId: string };
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-quantika-internal') ?? '';
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as IngestBody;
  const { phone, messageId, type, content } = body;

  if (!phone || !messageId || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const client = getWhatsAppClient();
  if (!client) {
    return NextResponse.json({ error: 'WhatsApp client not configured' }, { status: 503 });
  }

  const msg: WhatsAppIncomingMessage = {
    id: messageId,
    from: phone,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type,
    ...(type === 'text' && typeof content === 'string'
      ? { text: { body: content } }
      : {}),
    ...(type === 'image' && typeof content === 'object'
      ? { image: { id: content.mediaId, mime_type: 'image/jpeg', sha256: '' } }
      : {}),
    ...(type === 'audio' && typeof content === 'object'
      ? { audio: { id: content.mediaId, mime_type: 'audio/ogg', sha256: '' } }
      : {}),
    ...(type === 'document' && typeof content === 'object'
      ? { document: { id: content.mediaId, mime_type: 'application/pdf', sha256: '' } }
      : {}),
  };

  const result = await parseForwardedMessage(msg, client);

  return NextResponse.json({
    parsed: result.parsedCargo ?? null,
    vessel: result.parsedVessel ?? null,
    confidence: result.confidence,
    missingFields: result.missingFields,
    rawText: result.rawText,
  });
}
