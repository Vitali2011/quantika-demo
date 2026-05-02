import matrixData from './l5c-matrix.json';

export interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
  requires_extra_clean: boolean;
  requires_manual_review: boolean;
  blocking_pairs: Array<{ previous: string; reason: string }>;
}

const ALIAS_MAP: Record<string, string> = {
  wheat: 'grain',
  corn: 'grain',
  maize: 'grain',
  hbi: 'dri',
  'iron ore': 'iron-ore',
  ironore: 'iron-ore',
};

function normalize(cargo: string): string {
  const lower = cargo.trim().toLowerCase();
  return ALIAS_MAP[lower] ?? lower;
}

type MatrixPair = {
  previous: string;
  next: string;
  compatible: boolean;
  extra_clean?: boolean;
  reason?: string;
};

const PAIRS: MatrixPair[] = matrixData.pairs as MatrixPair[];

function lookupPair(prev: string, next: string): MatrixPair | undefined {
  const normPrev = normalize(prev);
  const normNext = normalize(next);
  return PAIRS.find(
    (p) => normalize(p.previous) === normPrev && normalize(p.next) === normNext
  );
}

export function checkCompatibility(
  prevCargoes: string[],
  newCargo: string
): CompatibilityResult {
  if (!newCargo?.trim() || prevCargoes.length === 0) {
    return {
      compatible: true,
      warnings: [],
      requires_extra_clean: false,
      requires_manual_review: false,
      blocking_pairs: [],
    };
  }

  const blocking_pairs: Array<{ previous: string; reason: string }> = [];
  const warnings: string[] = [];
  let requires_extra_clean = false;
  let requires_manual_review = false;

  for (const prev of prevCargoes) {
    if (!prev?.trim()) continue;
    const pair = lookupPair(prev, newCargo);
    if (!pair) {
      // Fail-closed: unknown pair → manual surveyor review required.
      // Rationale: matrix is incomplete; treating "no data" as "OK" is fail-open
      // and risks cargo contamination claim / P&I dispute (BUG-09).
      const reason = `No L5C data for ${normalize(prev)}→${normalize(newCargo)} — manual surveyor review required`;
      warnings.push(reason);
      requires_manual_review = true;
      blocking_pairs.push({ previous: prev.trim(), reason });
      continue;
    }
    if (!pair.compatible) {
      blocking_pairs.push({ previous: prev.trim(), reason: pair.reason ?? 'Incompatible cargo combination' });
    }
    if (pair.extra_clean) {
      requires_extra_clean = true;
    }
  }

  const compatible = blocking_pairs.length === 0;
  return { compatible, warnings, requires_extra_clean, requires_manual_review, blocking_pairs };
}

export function parseLastCargoes(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
