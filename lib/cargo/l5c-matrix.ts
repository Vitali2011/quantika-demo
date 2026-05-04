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

/**
 * Wave-γ-2 (B2): hierarchy taxonomy. Children resolve to their canonical
 * parent at lookup time, so adding a new variant ("hr coils", "drill pipes")
 * doesn't require a new matrix entry — they inherit the parent's
 * compatibility rules. IMSBC Code (IMO 2008) provides the structural
 * skeleton; broker overrides extend the parent → children lists.
 */
const TAXONOMY: Record<string, string[]> = {
  grain: ['wheat', 'corn', 'maize', 'barley', 'soy', 'soybean', 'rice', 'oats', 'sorghum', 'rye'],
  steel: ['steel coils', 'steel plates', 'steel sections', 'hr coils', 'cr coils', 'billets', 'rebar', 'slabs', 'wire rod'],
  pipes: ['project pipes', 'linepipe', 'line pipe', 'obs pipes', 'drill pipes', 'casing', 'tubing'],
  'iron-ore': ['iron ore', 'ironore', 'fe ore', 'iron-ore fines', 'pellet feed'],
  dri: ['hbi', 'sponge iron'],
  coal: ['coking coal', 'thermal coal', 'steam coal', 'met coal'],
  fertilizer: ['urea', 'ammonium nitrate', 'dap', 'map', 'potash', 'mop', 'sop'],
  cement: ['clinker', 'opc'],
  sulphur: ['sulfur'],
  scrap: ['hms', 'shredded scrap', 'busheling'],
  bauxite: ['alumina'],
};

/**
 * Flat alias map built from {@link TAXONOMY} at module load.
 * Maps lowercase variant → canonical parent name. Identity entries for parents.
 */
const ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [parent, children] of Object.entries(TAXONOMY)) {
    map[parent.toLowerCase()] = parent;
    for (const child of children) {
      map[child.toLowerCase()] = parent;
    }
  }
  // Legacy aliases preserved for back-compat with prod data already in DB.
  map['fertilizer-urea'] = 'fertilizer';
  return map;
})();

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

/**
 * Wave-γ-2 lookup result. Combines exact-match verdict with extra_clean
 * flags OR'd from any applicable wildcard rules (so `DRI→grain` exact
 * `compatible:false` still inherits the dust-prone `extra_clean:true`
 * flag from the symmetric `*→DRI` wildcard rule — fixing BUG-12).
 */
interface PairLookup {
  matched: boolean;
  compatible: boolean;
  reason?: string;
  extra_clean: boolean;
}

/**
 * Wave-γ-2 (C1): wildcard rules apply symmetrically by default.
 * `*→X extra_clean:true` (X is dust/contamination-prone) is interpreted as
 * BOTH `*→X` (anything before X) and `X→*` (X before anything) carrying the
 * same `extra_clean` flag. Exact-match entries retain precedence for the
 * compatible/incompatible verdict, but their extra_clean flag is OR'd with
 * matching wildcards so a known-incompatible pair still surfaces the
 * cleanliness requirement to the surveyor.
 */
function findWildcards(normPrev: string, normNext: string): MatrixPair[] {
  const matches: MatrixPair[] = [];
  for (const p of PAIRS) {
    if (p.previous === '*' && p.next === '*') {
      matches.push(p);
      continue;
    }
    if (p.previous === '*' && normalize(p.next) === normNext) {
      matches.push(p);
      continue;
    }
    if (p.next === '*' && normalize(p.previous) === normPrev) {
      matches.push(p);
      continue;
    }
    // C1 symmetric inversion: `*→X` rule also applies to `X→*` direction.
    if (p.previous === '*' && normalize(p.next) === normPrev) {
      matches.push(p);
      continue;
    }
    if (p.next === '*' && normalize(p.previous) === normNext) {
      matches.push(p);
      continue;
    }
  }
  return matches;
}

function lookupPair(prev: string, next: string): PairLookup {
  const normPrev = normalize(prev);
  const normNext = normalize(next);

  const exact = PAIRS.find(
    (p) => normalize(p.previous) === normPrev && normalize(p.next) === normNext
  );
  const wildcards = findWildcards(normPrev, normNext);

  if (exact) {
    return {
      matched: true,
      compatible: exact.compatible,
      reason: exact.reason,
      extra_clean: !!exact.extra_clean || wildcards.some((w) => !!w.extra_clean),
    };
  }
  if (wildcards.length > 0) {
    const incompatible = wildcards.find((w) => !w.compatible);
    return {
      matched: true,
      compatible: !incompatible,
      reason: incompatible?.reason,
      extra_clean: wildcards.some((w) => !!w.extra_clean),
    };
  }
  return { matched: false, compatible: false, extra_clean: false };
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

/** Strip the "in bags" suffix so contamination lookup uses the underlying commodity name. */
function stripBreakBulkSuffix(name: string): string {
  return name.replace(/\s+in\s+bags\s*$/i, '').trim() || name;
}

/**
 * Extract the canonical cargo name string from a CargoInput.
 * For break-bulk cargoes we still resolve to the underlying commodity so
 * contamination rules apply (wave-γ-2 / REGRESSION-01 fix). The break_bulk
 * flag is metadata for the surveyor, not a verdict override.
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
  const breakBulk = isBreakBulk(newCargo);

  if (!newCargoName?.trim() || prevCargoes.length === 0) {
    return {
      compatible: true,
      warnings: breakBulk
        ? [`${newCargoName} is BREAK_BULK (bagged form) — surveyor confirmation required for hold preparation`]
        : [],
      requires_extra_clean: false,
      requires_manual_review: false,
      blocking_pairs: [],
      ...(breakBulk ? { break_bulk: true } : {}),
    };
  }

  // Wave-γ-2 (REGRESSION-01): contamination lookup uses the underlying
  // commodity even for break-bulk. "wheat in bags" still inherits the
  // grain contamination rules; the bag form is metadata for the surveyor,
  // not a fail-closed override.
  const contaminationName = breakBulk ? stripBreakBulkSuffix(newCargoName) : newCargoName;

  const blocking_pairs: Array<{ previous: string; reason: string }> = [];
  const warnings: string[] = [];
  let requires_extra_clean = false;
  let requires_manual_review = false;

  for (const prev of prevCargoes) {
    if (!prev?.trim()) continue;
    const lookup = lookupPair(prev, contaminationName);
    if (!lookup.matched) {
      const reason = `No L5C data for ${normalize(prev)}→${normalize(contaminationName)} — manual surveyor review required`;
      warnings.push(reason);
      requires_manual_review = true;
      blocking_pairs.push({ previous: prev.trim(), reason });
      continue;
    }
    if (!lookup.compatible) {
      blocking_pairs.push({ previous: prev.trim(), reason: lookup.reason ?? 'Incompatible cargo combination' });
    }
    if (lookup.extra_clean) {
      requires_extra_clean = true;
    }
  }

  if (breakBulk) {
    warnings.push(
      `${newCargoName} is BREAK_BULK (bagged form) — surveyor confirmation required for hold preparation`,
    );
  }

  const compatible = blocking_pairs.length === 0;
  return {
    compatible,
    warnings,
    requires_extra_clean,
    requires_manual_review,
    blocking_pairs,
    ...(breakBulk ? { break_bulk: true } : {}),
  };
}

export function parseLastCargoes(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
