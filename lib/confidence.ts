import type { ConfidenceLevel, ParsedCargo, ParsedVessel } from './types';
import { CONFIDENCE_COLORS } from './constants';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FieldConfidence {
  /** Dot-path of the field, e.g. "cargo.weightMt" */
  field: string;
  level: ConfidenceLevel;
  score?: number;
  sourceQuote?: string;
}

export interface MatchConfidence {
  /** Overall worst level across critical fields (uncertain > missing > inferred > verified) */
  level: ConfidenceLevel;
  /** True if any critical field is 'uncertain' — blocks the Send Quote action */
  blockSend: boolean;
  /** Dot-paths of uncertain critical fields (the ones the user can review & confirm) */
  blockedFields: string[];
  /** Full per-field breakdown for UI rendering */
  fieldConfidences: FieldConfidence[];
}

// ── Confidence mapping ───────────────────────────────────────────────────────

/**
 * Maps a numeric confidence score (0-1) to a discrete ConfidenceLevel.
 *
 * - `verified`  — score ≥ 0.85 AND field was explicitly quoted from source email (hasSourceQuote)
 * - `inferred`  — score ≥ 0.85 without a source quote, OR 0.5 ≤ score < 0.85
 * - `uncertain` — score < 0.5 (AI is unsure; blocks Send Quote)
 * - `missing`   — score is null/undefined (field absent from parsed data)
 */
export function mapConfidenceToLevel(
  score: number | null | undefined,
  hasSourceQuote: boolean = false,
): ConfidenceLevel {
  if (score === null || score === undefined || Number.isNaN(score) || score === Infinity) return 'missing';
  if (score >= 0.85 && hasSourceQuote) return 'verified';
  if (score >= 0.85) return 'inferred'; // high score without sourceQuote → inferred
  if (score >= 0.5) return 'inferred';
  return 'uncertain';
}

/**
 * Returns the Tailwind border-color class for the given confidence level.
 * Thin wrapper around CONFIDENCE_COLORS for convenient component imports.
 */
export function getConfidenceColorClass(level: ConfidenceLevel): string {
  return CONFIDENCE_COLORS[level];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** LLM parse-level confidence → representative numeric score */
function parseConfToScore(pc: 'confirmed' | 'interpreted' | 'uncertain'): number {
  switch (pc) {
    case 'confirmed':    return 0.9;
    case 'interpreted':  return 0.65;
    case 'uncertain':    return 0.3;
  }
}

/**
 * Severity ordering for picking the worst level across critical fields.
 * Higher = worse. uncertain > missing > inferred > verified.
 */
const LEVEL_SEVERITY: Record<ConfidenceLevel, number> = {
  uncertain: 3,
  missing:   2,
  inferred:  1,
  verified:  0,
};

function worstLevel(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return LEVEL_SEVERITY[a] >= LEVEL_SEVERITY[b] ? a : b;
}

// ── Core engine ──────────────────────────────────────────────────────────────

const DEFAULT_CRITICAL_FIELDS = [
  'cargo.weightMt',
  'cargo.laycanStart',
  'cargo.laycanEnd',
  'cargo.originPort',
  'cargo.destinationPort',
  'vessel.imo',
] as const;

/**
 * Resolves a dot-path field from the parsed cargo/vessel data into a FieldConfidence.
 */
function resolveField(
  fieldPath: string,
  cargo: ParsedCargo,
  vessel: ParsedVessel | null,
): FieldConfidence {
  switch (fieldPath) {
    case 'cargo.weightMt': {
      const cf = cargo.weightMt;
      if (!cf) return { field: fieldPath, level: 'missing' };
      const score = parseConfToScore(cf.confidence);
      return {
        field: fieldPath,
        level: mapConfidenceToLevel(score, !!cf.sourceText),
        score,
        sourceQuote: cf.sourceText,
      };
    }

    case 'cargo.laycanStart':
    case 'cargo.laycanEnd': {
      if (!cargo.laycan) return { field: fieldPath, level: 'missing' };
      // laycan is a plain string — no numeric confidence metadata; treat as inferred
      return { field: fieldPath, level: 'inferred', score: 0.7 };
    }

    case 'cargo.originPort': {
      const cf = cargo.originPort;
      if (!cf) return { field: fieldPath, level: 'missing' };
      const score = parseConfToScore(cf.confidence);
      return {
        field: fieldPath,
        level: mapConfidenceToLevel(score, !!cf.sourceText),
        score,
        sourceQuote: cf.sourceText,
      };
    }

    case 'cargo.destinationPort': {
      const cf = cargo.destinationPort;
      if (!cf) return { field: fieldPath, level: 'missing' };
      const score = parseConfToScore(cf.confidence);
      return {
        field: fieldPath,
        level: mapConfidenceToLevel(score, !!cf.sourceText),
        score,
        sourceQuote: cf.sourceText,
      };
    }

    case 'vessel.imo': {
      if (!vessel || !vessel.imo) return { field: fieldPath, level: 'missing' };
      // IMO is a plain identifier — no AI confidence metadata; treat as inferred
      return { field: fieldPath, level: 'inferred', score: 0.7, sourceQuote: vessel.imo };
    }

    default:
      return { field: fieldPath, level: 'missing' };
  }
}

/**
 * Computes a confidence summary for a matched cargo-vessel pair.
 *
 * Inspects all critical fields, determines which are `uncertain` (blocks Send Quote),
 * and returns the overall worst confidence level for display.
 *
 * `missing` does NOT block Send — the field is simply absent from parsed data.
 * `uncertain` DOES block Send — the AI produced a value but flagged low confidence.
 *
 * @param parsedCargo   - Parsed cargo from the LLM pipeline
 * @param parsedVessel  - Parsed vessel, or null if not available
 * @param criticalFields - Optional override of the default critical field list
 */
export function computeMatchConfidence(
  parsedCargo: ParsedCargo,
  parsedVessel: ParsedVessel | null,
  criticalFields: string[] = [...DEFAULT_CRITICAL_FIELDS],
): MatchConfidence {
  if (criticalFields.length === 0) {
    return { level: 'missing', blockSend: false, blockedFields: [], fieldConfidences: [] };
  }
  const fieldConfidences: FieldConfidence[] = criticalFields.map((f) =>
    resolveField(f, parsedCargo, parsedVessel),
  );

  const criticalSet = new Set(criticalFields);
  const criticalConfidences = fieldConfidences.filter((fc) => criticalSet.has(fc.field));

  const blockedFields = criticalConfidences
    .filter((fc) => fc.level === 'uncertain')
    .map((fc) => fc.field);

  const overallLevel = criticalConfidences.reduce<ConfidenceLevel>(
    (acc, fc) => worstLevel(acc, fc.level),
    'verified',
  );

  return {
    level: overallLevel,
    blockSend: blockedFields.length > 0,
    blockedFields,
    fieldConfidences,
  };
}
