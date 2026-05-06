/**
 * Gemini structured-output schema for the parse-recap endpoint.
 *
 * Fixture recap output is a flat JSON object (not wrapped in `items`).
 * Fields are described in lib/prompts/parse-recap.ts.
 */

import { Type } from '@google/genai';

export const PARSE_RECAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    vessel_name: { type: Type.STRING, nullable: true },
    imo: { type: Type.STRING, nullable: true },
    charterer: { type: Type.STRING, nullable: true },
    owner: { type: Type.STRING, nullable: true },
    broker: { type: Type.STRING, nullable: true },
    cargo_description: { type: Type.STRING, nullable: true },
    cargo_quantity_mt: { type: Type.NUMBER, nullable: true },
    load_port: { type: Type.STRING, nullable: true },
    discharge_port: { type: Type.STRING, nullable: true },
    laycan_start: { type: Type.STRING, nullable: true },
    laycan_end: { type: Type.STRING, nullable: true },
    freight_rate: { type: Type.STRING, nullable: true },
    freight_type: { type: Type.STRING, nullable: true },
    commission_percent: { type: Type.NUMBER, nullable: true },
    commission_breakdown: { type: Type.STRING, nullable: true },
    demurrage_rate: { type: Type.STRING, nullable: true },
    loading_rate: { type: Type.STRING, nullable: true },
    discharge_rate: { type: Type.STRING, nullable: true },
    loading_terms: { type: Type.STRING, nullable: true },
    discharge_terms: { type: Type.STRING, nullable: true },
    cp_form: { type: Type.STRING, nullable: true },
    subjects: { type: Type.STRING, nullable: true },
    subjects_deadline: { type: Type.STRING, nullable: true },
    additional_clauses: { type: Type.STRING, nullable: true },
    notes: { type: Type.STRING, nullable: true },
  },
};
