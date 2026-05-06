/**
 * Barrel export for Gemini structured-output schemas.
 *
 * Each schema defines the responseSchema passed to Vertex AI's
 * generateContent config when the provider is Gemini. This eliminates
 * markdown fence stripping and guarantees valid JSON responses.
 */

export { PARSE_CARGO_SCHEMA } from './parse-cargo';
export { PARSE_VESSEL_SCHEMA } from './parse-vessel';
export { PARSE_RECAP_SCHEMA } from './parse-recap';
export { CLASSIFY_SCHEMA } from './classify';
