/**
 * Gemini structured-output schema for the parse-vessel endpoint.
 *
 * Defines the top-level `{ items: [...] }` wrapper. Fields use flexible types
 * to accommodate both plain values and ConfidenceField objects.
 *
 * @see lib/prompts/parse-vessel.ts for the full field contract.
 */

import { Type } from '@google/genai';

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

const confidenceFieldDate = {
  type: Type.OBJECT,
  properties: {
    value: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        open: { type: Type.STRING, nullable: true },
        close: { type: Type.STRING, nullable: true },
        display: { type: Type.STRING, nullable: true },
      },
    },
    confidence: { type: Type.STRING },
    source_text: { type: Type.STRING },
  },
  required: ['value', 'confidence'],
};

const vesselItemSchema = {
  type: Type.OBJECT,
  properties: {
    vessel_name: confidenceFieldString,
    imo: { type: Type.STRING, nullable: true },
    flag: { type: Type.STRING, nullable: true },
    built: confidenceFieldNumber,
    dwt_summer: confidenceFieldNumber,
    draft_max: confidenceFieldNumber,
    loa: confidenceFieldNumber,
    beam: confidenceFieldNumber,
    grain_capacity: { type: Type.NUMBER, nullable: true },
    bale_capacity: { type: Type.NUMBER, nullable: true },
    holds_count: { type: Type.NUMBER, nullable: true },
    hatches_count: { type: Type.NUMBER, nullable: true },
    geared: { type: Type.BOOLEAN, nullable: true },
    gear_description: { type: Type.STRING, nullable: true },
    open_position: confidenceFieldString,
    dwcc: { ...confidenceFieldNumber, nullable: true },
    open_date: confidenceFieldDate,
    last_cargoes: { type: Type.STRING, nullable: true },
    vessel_type: { type: Type.STRING, nullable: true },
    class_society: { type: Type.STRING, nullable: true },
    p_and_i: { type: Type.STRING, nullable: true },
    special_survey_due: { type: Type.STRING, nullable: true },
    ice_class: { type: Type.STRING, nullable: true },
    itf_fitted: { type: Type.BOOLEAN, nullable: true },
    owner: { type: Type.STRING, nullable: true },
    operator: { type: Type.STRING, nullable: true },
    speed_ballast: { type: Type.NUMBER, nullable: true },
    speed_laden: { type: Type.NUMBER, nullable: true },
    consumption_ballast: { type: Type.NUMBER, nullable: true },
    consumption_laden: { type: Type.NUMBER, nullable: true },
  },
  required: ['vessel_name', 'built', 'dwt_summer', 'flag', 'open_position'],
};

export const PARSE_VESSEL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: vesselItemSchema,
    },
  },
  required: ['items'],
};
