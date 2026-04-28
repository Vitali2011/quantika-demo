import type { WhatsAppClient } from './client';
import type { WhatsAppIncomingMessage } from './types';
import type { ParsedCargo, ParsedVessel, ConfidenceLevel } from '@/lib/types';
import { callAiJson } from '@/lib/openai';
import { transcribeAudio } from './voice-transcribe';
import { extractTextFromImage } from './image-ocr';
import { extractTextFromPdf } from './pdf-extract';

export interface ForwardParseResult {
  parsedCargo?: ParsedCargo;
  parsedVessel?: ParsedVessel;
  confidence: ConfidenceLevel;
  missingFields: string[];
  rawText: string;
}

const FORWARD_PARSE_SYSTEM_PROMPT =
  'You are a shipping cargo/vessel parser for a maritime brokerage platform. ' +
  'Parse the forwarded message and extract structured cargo or vessel data. ' +
  'Return JSON with fields: origin_port, destination_port, cargo_description, weight_mt, ' +
  'laycan, loading_rate, discharge_rate, commission_percent, missing_info (array of missing fields). ' +
  'Each field with confidence should be: { value: ..., confidence: "confirmed"|"interpreted"|"uncertain" }. ' +
  'If the message describes a vessel position, include vessel_name, imo, dwt, open_position, open_date. ' +
  'Return { missing_info: [...] } for fields you cannot determine.';

interface RawParseResponse {
  origin_port?: { value: string; confidence: string } | string;
  destination_port?: { value: string; confidence: string } | string;
  cargo_description?: { value: string; confidence: string } | string;
  weight_mt?: { value: number; confidence: string } | number;
  laycan?: string;
  missing_info?: string[];
  vessel_name?: { value: string; confidence: string } | string;
  [key: string]: unknown;
}

function toConfField<T>(val: unknown): { value: T; confidence: 'confirmed' | 'interpreted' | 'uncertain'; sourceText?: string } | null {
  if (val == null) return null;
  if (typeof val === 'object' && 'value' in val) {
    const obj = val as { value: T; confidence?: string };
    return {
      value: obj.value,
      confidence: (obj.confidence as 'confirmed' | 'interpreted' | 'uncertain') || 'uncertain',
    };
  }
  return { value: val as T, confidence: 'interpreted' };
}

function determineConfidence(raw: RawParseResponse, rawText: string): ConfidenceLevel {
  if (!rawText || (!raw.origin_port && !raw.cargo_description && !raw.vessel_name)) {
    return 'uncertain';
  }
  const missing = raw.missing_info ?? [];
  if (missing.length === 0) return 'verified';
  if (missing.length <= 2) return 'inferred';
  return 'uncertain';
}

/**
 * Dispatches forwarded WhatsApp message by type, extracts text, parses via AI.
 */
export async function parseForwardedMessage(
  msg: WhatsAppIncomingMessage,
  client: WhatsAppClient,
): Promise<ForwardParseResult> {
  let rawText = '';

  switch (msg.type) {
    case 'text':
      rawText = msg.text?.body ?? '';
      break;

    case 'image': {
      const media = await client.downloadMedia(msg.image!.id);
      rawText = await extractTextFromImage(media.url);
      break;
    }

    case 'audio': {
      const media = await client.downloadMedia(msg.audio!.id);
      const transcription = await transcribeAudio(media.url, media.mimeType);
      rawText = transcription.text;
      break;
    }

    case 'document': {
      const media = await client.downloadMedia(msg.document!.id);
      rawText = await extractTextFromPdf(media.url);
      break;
    }

    default:
      return {
        confidence: 'uncertain',
        missingFields: ['unsupported message type'],
        rawText: '',
      };
  }

  const raw = await callAiJson<RawParseResponse>(
    rawText,
    FORWARD_PARSE_SYSTEM_PROMPT,
    undefined,
    {},
  );

  const missingFields = Array.isArray(raw.missing_info) ? raw.missing_info : [];
  const confidence = determineConfidence(raw, rawText);

  const result: ForwardParseResult = {
    confidence,
    missingFields,
    rawText,
  };

  if (raw.origin_port || raw.cargo_description || raw.weight_mt) {
    result.parsedCargo = {
      emailId: `wa-${msg.id}`,
      itemIndex: 0,
      originPort: toConfField<string>(raw.origin_port),
      originCountry: null,
      destinationPort: toConfField<string>(raw.destination_port),
      destinationCountry: null,
      cargoDescription: toConfField<string>(raw.cargo_description),
      weightMt: toConfField<number>(raw.weight_mt),
      weightMtMin: null,
      weightMtMax: null,
      volumeCbm: null,
      dimensions: null,
      cargoType: 'BULK',
      containerType: null,
      quantity: null,
      incoterms: null,
      preferredDates: null,
      laycan: typeof raw.laycan === 'string' ? raw.laycan : null,
      loadingRate: null,
      dischargeRate: null,
      commissionPercent: null,
      commissionTerms: null,
      specialRequirements: null,
      stowageFactor: null,
      missingInfo: missingFields,
    };
  }

  return result;
}
