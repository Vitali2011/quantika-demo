/**
 * Gemini structured-output schema for the classify endpoint.
 *
 * Returns `{ classifications: [...] }` wrapper with per-email classification items.
 *
 * @see lib/prompts/classify.ts for category definitions and urgency rules.
 */

import { Type } from '@google/genai';

const classificationItemSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    category: {
      type: Type.STRING,
      enum: [
        'CARGO_INQUIRY',
        'VESSEL_POSITION',
        'FIXTURE_RECAP',
        'CLIENT_REPLY',
        'DOCUMENT',
        'TCT_REQUEST',
        'VESSEL_CERTIFICATE',
        'OTHER',
      ],
    },
    urgency: {
      type: Type.STRING,
      enum: ['low', 'medium', 'high'],
    },
    confidence: { type: Type.NUMBER },
    is_unanswered: { type: Type.BOOLEAN },
    days_without_reply: { type: Type.NUMBER, nullable: true },
    original_sender: { type: Type.STRING, nullable: true },
    original_sender_company: { type: Type.STRING, nullable: true },
  },
  required: ['id', 'category'],
};

export const CLASSIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    classifications: {
      type: Type.ARRAY,
      items: classificationItemSchema,
    },
  },
  required: ['classifications'],
};
