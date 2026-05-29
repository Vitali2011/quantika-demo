/**
 * Post-response validation for "Explain this deal" (#589).
 * Extracts numeric values from LLM output and cross-checks against the match payload
 * to detect hallucinated cargo quantities, vessel DWT, or freight rates.
 *
 * R2 (#589 round 2): also strips invented qualitative tokens (class society,
 * gear status, stowage factor) when payload doesn't carry that field.
 */
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import { isRange } from '@/lib/types';

/** Numbers below this threshold are exempt (percentages, scores, hold counts, small measurements). */
const LARGE_NUMBER_THRESHOLD = 500;

/** Allowed deviation between a response number and a payload number (2%). */
const TOLERANCE_FRACTION = 0.02;

function isYearLike(n: number): boolean {
  return Number.isInteger(n) && n >= 1900 && n <= 2100;
}

/**
 * Extract all "specification-scale" numbers (≥500, non-year) from LLM response text.
 * Handles comma-formatted numbers ("28,000"), unformatted ("28000"), and decimals.
 *
 * R2: explicit handling for unformatted 4+ digit (Gemini sometimes outputs "50000"
 * without comma) — comma-strip in normalize covers both forms.
 */
export function extractSpecNumbers(text: string): number[] {
  const normalized = text.replace(/(\d),(\d{3})/g, '$1$2');
  const results = new Set<number>();
  const pattern = /\b(\d+(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(normalized)) !== null) {
    const n = parseFloat(m[1]);
    if (n >= LARGE_NUMBER_THRESHOLD && !isYearLike(n)) {
      results.add(n);
    }
  }
  return [...results];
}

/**
 * Extract large numeric values embedded in a string field (e.g. "1500 MTPD SHINC" → 1500).
 * Used to allow the LLM to cite operational rates and description-embedded quantities
 * that are present in string-typed payload fields.
 */
function extractNumsFromStringField(s: string | null | undefined): number[] {
  if (!s) return [];
  return extractSpecNumbers(s);
}

/**
 * Collect all large numeric values from the match payload that the LLM is allowed to cite.
 * Includes both typed numeric fields and large numbers embedded in string-typed fields
 * (loading/discharge rates, cargo descriptions) to avoid false-positive strips.
 * Only includes numbers ≥ LARGE_NUMBER_THRESHOLD and not year-like.
 */
export function buildPayloadNumberSet(
  match: Match,
  cargo: ParsedCargo | null,
  vessel: ParsedVessel | null,
): Set<number> {
  const nums = new Set<number>();

  const add = (v: unknown) => {
    if (typeof v === 'number' && isFinite(v) && v >= LARGE_NUMBER_THRESHOLD && !isYearLike(v)) {
      nums.add(v);
    }
  };
  const addFromString = (s: string | null | undefined) => {
    for (const n of extractNumsFromStringField(s)) nums.add(n);
  };

  if (cargo) {
    add(cargo.weightMt?.value);
    add(cargo.weightMtMin);
    add(cargo.weightMtMax);
    add(cargo.volumeCbm);
    add(cargo.freightRateUsd);
    if (typeof cargo.quantity === 'number') {
      add(cargo.quantity);
    } else if (isRange(cargo.quantity)) {
      add(cargo.quantity.min);
      add(cargo.quantity.max);
    }
    if (cargo.weightPerPort) cargo.weightPerPort.forEach(add);
    // String fields that may embed operational rates or component weights
    addFromString(cargo.loadingRate);
    addFromString(cargo.dischargeRate);
    addFromString(
      typeof cargo.cargoDescription === 'object' && cargo.cargoDescription !== null
        ? (cargo.cargoDescription as { value?: string }).value
        : (cargo.cargoDescription as unknown) as string | undefined,
    );
  }

  if (vessel) {
    add(vessel.dwtSummer?.value);
    add(vessel.dwcc?.value);
    add(vessel.draftMax?.value);
    add(vessel.loa);
    add(vessel.beam);
    add(vessel.grt);
    add(vessel.nrt);
    add(vessel.grainCapacity);
    add(vessel.baleCapacity);
    // String-embedded capacities (e.g. craneCapacity "4x30T" — numbers below threshold, harmless)
    addFromString(vessel.speedLaden);
    addFromString(vessel.consumption);
    // IMO is stored as string but cited by model
    addFromString(vessel.imo);
  }

  if (match.economics) {
    add(match.economics.totalUsd);
    const bd = match.economics.breakdown;
    if (bd) {
      add(bd.bunkerCost);
      add(bd.euEtsAmount);
      add(bd.warRiskPremium);
      if (bd.warRiskTotal !== undefined) add(bd.warRiskTotal);
      if (bd.splitBunkerSavings !== undefined) add(bd.splitBunkerSavings);
    }
    // Custom tce/marketTce fields used in corpus scenarios (not in EconomicsResult type)
    const econAny = match.economics as unknown as Record<string, unknown>;
    if (typeof econAny.tce === 'number') add(econAny.tce);
    if (typeof econAny.marketTce === 'number') add(econAny.marketTce);
  }

  return nums;
}

function isWithinTolerance(n: number, allowed: Set<number>): boolean {
  for (const a of allowed) {
    if (Math.abs(n - a) / Math.max(a, 1) <= TOLERANCE_FRACTION) return true;
  }
  return false;
}

/**
 * Common port/city names Gemini invents in shipping narrations when absent from
 * the match payload. Used by stripInventedContent to detect hallucinated locations.
 */
const PORT_NAMES: readonly string[] = [
  // Asia-Pacific
  'Singapore', 'Hong Kong', 'Busan', 'Yokohama', 'Kobe', 'Tokyo', 'Manila',
  'Jakarta', 'Surabaya', 'Port Klang', 'Colombo',
  // China
  'Shanghai', 'Tianjin', 'Qingdao', 'Ningbo', 'Shenzhen', 'Guangzhou', 'Dalian',
  // Middle East
  'Dubai', 'Fujairah', 'Jeddah', 'Dammam', 'Aqaba', 'Muscat',
  // Europe (North/West)
  'Rotterdam', 'Hamburg', 'Antwerp', 'Amsterdam', 'Bremen', 'Bremerhaven',
  'Marseille', 'Barcelona', 'Bilbao', 'Genoa', 'Trieste',
  // Europe (Baltic)
  'Gdansk', 'Gdynia', 'Riga', 'Tallinn', 'Helsinki', 'Gothenburg', 'Copenhagen',
  // Med/Black Sea
  'Piraeus', 'Thessaloniki', 'Istanbul', 'Izmir', 'Constanta', 'Novorossiysk',
  'Odessa', 'Batumi', 'Varna',
  // Africa
  'Durban', 'Cape Town', 'Richards Bay', 'Lagos', 'Abidjan', 'Mombasa',
  'Dar es Salaam',
  // Americas
  'Houston', 'New Orleans', 'Tampa', 'Baltimore', 'Vancouver', 'Montreal',
  'Santos', 'Paranagua', 'Tubarao', 'Rosario', 'Valparaiso',
  // Australia
  'Melbourne', 'Brisbane', 'Fremantle', 'Newcastle',
  // India
  'Mumbai', 'Chennai', 'Haldia', 'Visakhapatnam', 'Kandla',
  // Eastern Med / North Africa
  'Alexandria', 'Port Said', 'Damietta',
];

/** Class society abbreviations Gemini commonly invents when classSociety is null. */
const CLASS_SOCIETIES = [
  'DNV',
  'DNV-GL',
  'DNV GL',
  'LR',
  "Lloyd's Register",
  'ABS',
  'BV',
  'NK',
  'NKK',
  'ClassNK',
  'RINA',
  'CCS',
  'KR',
  'KRS',
  'IRS',
];

const REDACTION_NUMBER = '[redacted: not in match data]';
const REDACTION_CLASS = '[redacted: class society not in match data]';
const REDACTION_GEAR = '[redacted: gear status not in match data]';
const REDACTION_STOWAGE = '[redacted: stowage factor not in match data]';
const REDACTION_LOCATION = '[redacted: location not in match data]';

function normalizeClassSocietyToken(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '').replace(/[‘’']/g, '');
}

/**
 * Extract all location names from the match payload that the LLM is allowed to cite.
 * Returns uppercase tokens so callers can do case-insensitive membership checks.
 */
export function extractAllowedLocationTokens(
  cargo: ParsedCargo | null,
  vessel: ParsedVessel | null,
): Set<string> {
  const tokens = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (v) tokens.add(v.toUpperCase().trim());
  };

  if (cargo) {
    add(cargo.originPort?.value);
    add(cargo.destinationPort?.value);
    if (cargo.originPortAlternatives) cargo.originPortAlternatives.forEach(add);
    if (cargo.originPortRotation) cargo.originPortRotation.forEach(add);
    if (cargo.destinationPortAlternatives) cargo.destinationPortAlternatives.forEach(add);
    if (cargo.destinationPortRotation) cargo.destinationPortRotation.forEach(add);
  }

  if (vessel) {
    add(vessel.openPosition?.value);
  }

  return tokens;
}

export type ValidationResult = {
  valid: boolean;
  inventedNumbers: number[];
};

/**
 * Validate that the LLM response does not cite large numeric values
 * absent from the match payload.
 */
export function validateExplainDealResponse(
  text: string,
  match: Match,
  cargo: ParsedCargo | null,
  vessel: ParsedVessel | null,
): ValidationResult {
  const responseNumbers = extractSpecNumbers(text);
  const payloadNumbers = buildPayloadNumberSet(match, cargo, vessel);

  const inventedNumbers = responseNumbers.filter(
    (n) => !isWithinTolerance(n, payloadNumbers),
  );

  return { valid: inventedNumbers.length === 0, inventedNumbers };
}

export type StripResult = {
  text: string;
  inventedNumbers: number[];
  forbiddenTokens: string[];
};

/**
 * R2 strip-not-retry: post-process the LLM response by replacing invented
 * numerics and forbidden qualitative tokens with inline redaction markers.
 *
 * Strips:
 * - Large numbers (≥500) absent from match payload, including unformatted (50000)
 *   and comma-formatted (50,000) variants
 * - Class society abbreviations when vessel.classSociety is null OR doesn't match
 * - Gear status ("gearless", "geared") when vessel.geared is null/undefined
 * - "stowage factor X.Y" phrases when cargo.stowageFactor is null
 */
export function stripInventedContent(
  text: string,
  match: Match,
  cargo: ParsedCargo | null,
  vessel: ParsedVessel | null,
): StripResult {
  const payloadNumbers = buildPayloadNumberSet(match, cargo, vessel);
  const inventedNumbers: number[] = [];
  const forbiddenTokens: string[] = [];

  // 1. Strip invented numbers. Pattern covers: comma-formatted (50,000),
  //    unformatted 4+ digit (50000), and decimals (1.25 — caught for context
  //    but filtered by threshold below; the stowage factor pass handles SF).
  let stripped = text.replace(
    /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b\d{4,}(?:\.\d+)?\b/g,
    (raw) => {
      const n = parseFloat(raw.replace(/,/g, ''));
      if (!Number.isFinite(n)) return raw;
      if (n < LARGE_NUMBER_THRESHOLD || isYearLike(n)) return raw;
      if (isWithinTolerance(n, payloadNumbers)) return raw;
      inventedNumbers.push(n);
      return REDACTION_NUMBER;
    },
  );

  // 2. Strip stowage factor mentions when cargo.stowageFactor is null.
  //    Catches "stowage factor of 1.25", "SF 1.25 m³/MT", "stowage factor: 1.25".
  if (!cargo?.stowageFactor) {
    stripped = stripped.replace(
      /\b(?:stowage\s*factor|SF)\s*(?:of|is|:|=|approximately|approx\.?|~)?\s*\d+(?:\.\d+)?\s*(?:m³?\/?MT|m3\/MT)?/gi,
      (raw) => {
        forbiddenTokens.push(raw.trim());
        return REDACTION_STOWAGE;
      },
    );
  }

  // 3. Strip class society mentions that don't match vessel.classSociety.
  //    Exception: preserve token if it's a substring of vessel.name (vessel named after society).
  const payloadClass = vessel?.classSociety
    ? normalizeClassSocietyToken(vessel.classSociety)
    : null;
  const vesselNameUpper = (vessel?.vesselName?.value ?? '').toUpperCase();
  for (const candidate of CLASS_SOCIETIES) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    stripped = stripped.replace(re, (raw) => {
      const norm = normalizeClassSocietyToken(raw);
      if (payloadClass && norm === payloadClass) return raw;
      if (vesselNameUpper.includes(raw.toUpperCase())) return raw;
      forbiddenTokens.push(raw);
      return REDACTION_CLASS;
    });
  }

  // 4. Strip gear status when vessel.geared is null/undefined (unknown).
  if (vessel?.geared === null || vessel?.geared === undefined) {
    stripped = stripped.replace(/\b(gearless|geared)\b/gi, (raw) => {
      forbiddenTokens.push(raw);
      return REDACTION_GEAR;
    });
  }

  // 5. Strip port/city names absent from the match payload.
  //    Only checks names from PORT_NAMES list to avoid stripping legitimate capitalized words.
  //    Exception: preserve if the name is part of vessel.vesselName (BC7-style).
  const allowedLocations = extractAllowedLocationTokens(cargo, vessel);
  for (const portName of PORT_NAMES) {
    const escaped = portName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    stripped = stripped.replace(re, (raw) => {
      if (allowedLocations.has(raw.toUpperCase())) return raw;
      if (vesselNameUpper.includes(raw.toUpperCase())) return raw;
      forbiddenTokens.push(raw);
      return REDACTION_LOCATION;
    });
  }

  return { text: stripped, inventedNumbers, forbiddenTokens };
}

/**
 * Build a corrective retry prompt that lists invented numbers and the allowed values,
 * appended to the original user prompt.
 */
export function buildRetryPrompt(
  originalUserPrompt: string,
  inventedNumbers: number[],
  payloadNumbers: Set<number>,
): string {
  const allowedList =
    payloadNumbers.size > 0
      ? [...payloadNumbers].sort((a, b) => b - a).join(', ')
      : 'none — no quantities or capacities provided for this match';

  return `${originalUserPrompt}

⚠ CORRECTION REQUIRED:
Your previous response cited numeric values not found in the match data: ${inventedNumbers.join(', ')}.
Do NOT use these numbers — they are not in the data provided.

The ONLY large numeric values available from this match are: ${allowedList}.
For any cargo quantity, vessel DWT, freight rate, or cost figure not in that list, write "not specified" — do NOT estimate or substitute with typical values.`;
}
