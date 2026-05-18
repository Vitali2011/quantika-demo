/**
 * Gemini structured-output schema for the parse-recap endpoint.
 *
 * Fixture recap output is a flat JSON object (not wrapped in `items`).
 * Field names MUST exactly match `RawFixtureRecap` in
 * `lib/parsing/parse-recap-helpers.ts` for downstream consumption.
 * Additional eval-only fields (vessel_yob, vessel_flag, etc.) are present
 * in ground-truth references but not read by the parser — they exist so
 * progonq evals can measure extraction quality.
 */

import { Type } from '@google/genai';

const confidenceFieldString = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: { type: Type.STRING },
    source_text: { type: Type.STRING },
  },
};

const confidenceFieldNumber = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.NUMBER },
    confidence: { type: Type.STRING },
    source_text: { type: Type.STRING },
  },
};

const unknownTermItem = {
  type: Type.OBJECT,
  properties: {
    term: { type: Type.STRING },
    context: { type: Type.STRING },
  },
};

export const PARSE_RECAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // Vessel
    vessel_name: confidenceFieldString,
    vessel_yob: confidenceFieldNumber,
    vessel_flag: confidenceFieldString,
    vessel_dwt: { type: Type.STRING, nullable: true },
    vessel_draft: confidenceFieldString,
    vessel_geared: { type: Type.BOOLEAN, nullable: true },
    // Parties
    owners: confidenceFieldString,
    charterers: confidenceFieldString,
    account: confidenceFieldString,
    broker: { type: Type.STRING, nullable: true },
    // Ports
    load_port: confidenceFieldString,
    disch_port: confidenceFieldString,
    load_port_agent: { type: Type.STRING, nullable: true },
    disch_port_agent: { type: Type.STRING, nullable: true },
    // Cargo
    cargo_description: confidenceFieldString,
    cargo_quantity_min: { type: Type.STRING, nullable: true },
    cargo_quantity_max: { type: Type.STRING, nullable: true },
    cargo_packaging: { type: Type.STRING, nullable: true },
    // Dates
    laycan: confidenceFieldString,
    transit_time: { type: Type.STRING, nullable: true },
    // Freight
    freight_rate: confidenceFieldString,
    freight_basis: { type: Type.STRING, nullable: true },
    freight_payment: confidenceFieldString,
    // Laytime
    loading_rate: confidenceFieldString,
    loading_terms: confidenceFieldString,
    loading_working_hours: confidenceFieldString,
    discharging_rate: confidenceFieldString,
    discharging_terms: confidenceFieldString,
    discharging_working_hours: confidenceFieldString,
    // Demurrage & Despatch
    demurrage_rate: confidenceFieldString,
    demurrage_payment: { type: Type.STRING, nullable: true },
    despatch_rate: confidenceFieldString,
    // Legal
    cp_form: { type: Type.STRING, nullable: true },
    arbitration: { type: Type.STRING, nullable: true },
    law: { type: Type.STRING, nullable: true },
    // Commission
    commission: { type: Type.STRING, nullable: true },
    commission_percent: { type: Type.NUMBER, nullable: true },
    commission_pct: { type: Type.NUMBER, nullable: true },
    commission_base: { type: Type.STRING, nullable: true },
    commission_amount: { type: Type.STRING, nullable: true },
    commission_currency: { type: Type.STRING, nullable: true },
    commission_address_pct: { type: Type.NUMBER, nullable: true },
    commission_address_amount: { type: Type.STRING, nullable: true },
    commission_broker_pct: { type: Type.NUMBER, nullable: true },
    commission_broker_amount: { type: Type.STRING, nullable: true },
    // Meta
    subs: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    acknowledgement_deadline: { type: Type.STRING, nullable: true },
    confidentiality: { type: Type.BOOLEAN, nullable: true },
    additional_terms: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    unknown_terms: { type: Type.ARRAY, items: unknownTermItem, nullable: true },
  },
};
