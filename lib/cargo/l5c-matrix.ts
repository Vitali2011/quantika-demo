import matrixData from './l5c-matrix.json';

export interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
  requires_extra_clean: boolean;
  requires_manual_review: boolean;
  blocking_pairs: Array<{ previous: string; reason: string }>;
  /** Present when cargo was treated as break-bulk (form=bag / "in bags") */
  break_bulk?: boolean;
}

export type CargoInput = string | { name: string; form?: 'bulk' | 'bag' | 'container' | 'breakbulk' };

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
  // Exact match first
  const exact = PAIRS.find(
    (p) => normalize(p.previous) === normPrev && normalize(p.next) === normNext
  );
  if (exact) return exact;
  // Wildcard match: previous === '*'
  return PAIRS.find(
    (p) => p.previous === '*' && normalize(p.next) === normNext
  );
}

/**
 * Detect if cargo should be treated as break-bulk (bagged form).
 * Triggers on: form === 'bag' | 'breakbulk', OR name includes 'in bags'.
 */
function isBreakBulk(cargo: CargoInput): boolean {
  if (typeof cargo === 'string') {
    return cargo.toLowerCase().includes('in bags');
  }
  return cargo.form === 'bag' || cargo.form === 'breakbulk' ||
    cargo.name.toLowerCase().includes('in bags');
}

/**
 * Extract the canonical cargo name string from a CargoInput.
 * For break-bulk cargoes, we do NOT alias-normalize the name into a bulk
 * equivalent — they travel a distinct stowage pathway and their compatibility
 * is evaluated separately from their bulk counterpart.
 */
function extractName(cargo: CargoInput): string {
  if (typeof cargo === 'string') return cargo;
  return cargo.name;
}

export function checkCompatibility(
  prevCargoes: string[],
  newCargo: CargoInput
): CompatibilityResult {
  const newCargoName = extractName(newCargo);

  if (!newCargoName?.trim() || prevCargoes.length === 0) {
    return {
      compatible: true,
      warnings: [],
      requires_extra_clean: false,
      requires_manual_review: false,
      blocking_pairs: [],
    };
  }

  // Break-bulk pathway: bagged cargo has distinct stowage handling.
  // The matrix covers bulk-to-bulk pairs; bagged cargo requires a surveyor
  // sign-off because hold preparation differs (dunnage, liner bags, etc.).
  // We return a unique result that differs from the bulk verdict.
  if (isBreakBulk(newCargo)) {
    return {
      compatible: true,
      warnings: [
        `${newCargoName} is BREAK_BULK (bagged form) — surveyor confirmation required for hold preparation`,
      ],
      requires_extra_clean: false,
      requires_manual_review: false,
      blocking_pairs: [],
      break_bulk: true,
    };
  }

  const blocking_pairs: Array<{ previous: string; reason: string }> = [];
  const warnings: string[] = [];
  let requires_extra_clean = false;
  let requires_manual_review = false;

  for (const prev of prevCargoes) {
    if (!prev?.trim()) continue;
    const pair = lookupPair(prev, newCargoName);
    if (!pair) {
      // Fail-closed: unknown pair → manual surveyor review required.
      const reason = `No L5C data for ${normalize(prev)}→${normalize(newCargoName)} — manual surveyor review required`;
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
