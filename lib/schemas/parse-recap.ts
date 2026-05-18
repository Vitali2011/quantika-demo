/**
 * Gemini structured-output schema for the parse-recap endpoint.
 *
 * Fixture recap output is a flat JSON object (not wrapped in `items`).
 * Field names MUST exactly match `RawFixtureRecap` in
 * `lib/parsing/parse-recap-helpers.ts` — that interface is the canonical
 * downstream contract. Mismatched field names silently extract as null.
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

const unknownTermItem = {
  type: Type.OBJECT,
  properties: {
    term: { type: Type.STRING },
    note: { type: Type.STRING },
  },
};

export const PARSE_RECAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // Vessel
    vessel_name: confidenceFieldString,
    vessel_dwt: { type: Type.STRING, nullable: true },
    vessel_draft: { type: Type.STRING, nullable: true },
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
    freight_payment: { type: Type.STRING, nullable: true },
    // Laytime
    loading_rate: confidenceFieldString,
    loading_terms: confidenceFieldString,
    loading_working_hours: { type: Type.STRING, nullable: true },
    discharging_rate: confidenceFieldString,
    discharging_terms: confidenceFieldString,
    discharging_working_hours: { type: Type.STRING, nullable: true },
    // Demurrage
    demurrage_rate: confidenceFieldString,
    demurrage_payment: { type: Type.STRING, nullable: true },
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
    // Meta
    subs: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    confidentiality: { type: Type.BOOLEAN, nullable: true },
    additional_terms: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
    unknown_terms: { type: Type.ARRAY, items: unknownTermItem, nullable: true },
  },
};
