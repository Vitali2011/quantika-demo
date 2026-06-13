/**
 * Gemini structured-output schema for the parse-cargo endpoint.
 *
 * Defines the top-level `{ items: [...] }` wrapper. Individual item fields
 * use flexible typing (STRING / NUMBER) to accommodate ConfidenceField objects
 * that the model returns inline. Downstream parsing in parse-cargo/route.ts
 * already handles both plain values and ConfidenceField objects via toConfidence().
 *
 * @see lib/prompts/parse-cargo.ts for the full field contract.
 */

import { Type } from '@google/genai';

/** Reusable ConfidenceField schema — { value, confidence, source_text }. */
const confidenceFieldString = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: { type: Type.STRING },
    source_text: { type: Type.STRING },
  },
  required: ['value', 'confidence'],
};

const confidenceFieldNumber = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.NUMBER },
    confidence: { type: Type.STRING },
    source_text: { type: Type.STRING },
  },
  required: ['value', 'confidence'],
};

const cargoItemSchema = {
  type: Type.OBJECT,
  properties: {
    origin_port: confidenceFieldString,
    origin_country: { type: Type.STRING, nullable: true },
    destination_port: confidenceFieldString,
    destination_country: { type: Type.STRING, nullable: true },
    cargo_description: confidenceFieldString,
    cargo_origin_country: { type: Type.STRING, nullable: true },
    weight_mt: confidenceFieldNumber,
    weight_mt_min: { type: Type.NUMBER, nullable: true },
    weight_mt_max: { type: Type.NUMBER, nullable: true },
    volume_cbm: { type: Type.NUMBER, nullable: true },
    dimensions: { type: Type.STRING, nullable: true },
    cargo_type: { type: Type.STRING },
    container_type: { type: Type.STRING, nullable: true },
    quantity: { type: Type.NUMBER, nullable: true },
    incoterms: { type: Type.STRING, nullable: true },
    preferred_dates: confidenceFieldString,
    laycan: { type: Type.STRING, nullable: true },
    loading_rate: { type: Type.STRING, nullable: true },
    loading_terms: { type: Type.STRING, nullable: true },
    discharge_rate: { type: Type.STRING, nullable: true },
    discharge_terms: { type: Type.STRING, nullable: true },
    commission_percent: { type: Type.NUMBER, nullable: true },
    commission_terms: { type: Type.STRING, nullable: true },
    charterer_name: { type: Type.STRING, nullable: true },
    payout_condition: { type: Type.STRING, nullable: true },
    freight_rate_usd: { type: Type.NUMBER, nullable: true },
    special_requirements: { type: Type.STRING, nullable: true },
    stowage_factor: { type: Type.STRING, nullable: true },
    missing_info: { type: Type.ARRAY, items: { type: Type.STRING } },
    origin_port_alternatives: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    origin_port_rotation: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    destination_port_alternatives: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    destination_port_rotation: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    weight_per_port: { type: Type.ARRAY, items: { type: Type.NUMBER }, nullable: true },
    max_vessel_age_yrs: { type: Type.NUMBER, nullable: true },
    gear_required: { type: Type.BOOLEAN, nullable: true },
    max_loa_m: { type: Type.NUMBER, nullable: true },
    max_beam_m: { type: Type.NUMBER, nullable: true },
    flag_required: { type: Type.STRING, nullable: true },
    class_required: { type: Type.STRING, nullable: true },
  },
};

export const PARSE_CARGO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: cargoItemSchema,
    },
  },
  required: ['items'],
};
