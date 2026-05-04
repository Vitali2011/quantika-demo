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
  // petcoke parent + IMSBC canonical "petroleum coke" + broker shorthand "pet coke".
  petcoke: ['petroleum coke', 'pet coke'],
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
 * Wave-γ-2 (C1): wildcard rules apply asymmetrically for COMPATIBILITY,
 * symmetrically for EXTRA_CLEAN hint propagation.
 *
 * Direct wildcards (`*→X` matched as previous=*, next=X): contribute the
 * full verdict (compatible + reason + extra_clean).
 *
 * Inverted wildcards (`*→X` matched against next=X seen on previous side):
 * - extra_clean flag DOES travel symmetrically (X is dust-prone in BOTH directions)
 * - compatible:false DOES travel symmetrically (real safety risk is bi-directional)
 * - compatible:true does NOT travel — `*→X compatible:true extra_clean:true` is an
 *   ANNOTATION about X's dust profile, not a green-light verdict for X→anything.
 *   Without direct data we surface manual_review (audit 2026-05-04 fix to fail-OPEN bug
 *   where DRI→scrap was returning compatible:true via inversion).
 */
interface WildcardMatch {
  pair: MatrixPair;
  inverted: boolean;
}

function findWildcards(normPrev: string, normNext: string): WildcardMatch[] {
  const matches: WildcardMatch[] = [];
  for (const p of PAIRS) {
    if (p.previous === '*' && p.next === '*') {
      matches.push({ pair: p, inverted: false });
      continue;
    }
    if (p.previous === '*' && normalize(p.next) === normNext) {
      matches.push({ pair: p, inverted: false });
      continue;
    }
    if (p.next === '*' && normalize(p.previous) === normPrev) {
      matches.push({ pair: p, inverted: false });
      continue;
    }
    // Inverted matches (γ-2 fix): contribute extra_clean and incompat-block,
    // but NOT compatible:true verdicts. See WildcardMatch doc above.
    if (p.previous === '*' && normalize(p.next) === normPrev) {
      matches.push({ pair: p, inverted: true });
      continue;
    }
    if (p.next === '*' && normalize(p.previous) === normNext) {
      matches.push({ pair: p, inverted: true });
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
  // extra_clean OR's across all applicable wildcards (direct + inverted).
  const wildcardExtraClean = wildcards.some((w) => !!w.pair.extra_clean);

  if (exact) {
    return {
      matched: true,
      compatible: exact.compatible,
      reason: exact.reason,
      extra_clean: !!exact.extra_clean || wildcardExtraClean,
    };
  }

  // Direct wildcards source the verdict.
  const direct = wildcards.filter((w) => !w.inverted);
  if (direct.length > 0) {
    const incompatible = direct.find((w) => !w.pair.compatible);
    return {
      matched: true,
      compatible: !incompatible,
      reason: incompatible?.pair.reason,
      extra_clean: wildcardExtraClean,
    };
  }

  // Inverted blocks (compatible:false) propagate symmetrically — real bi-directional risk.
  const invertedBlocks = wildcards.filter((w) => w.inverted && !w.pair.compatible);
  if (invertedBlocks.length > 0) {
    return {
      matched: true,
      compatible: false,
      reason: invertedBlocks[0].pair.reason,
      extra_clean: wildcardExtraClean,
    };
  }

  // No verdict source. Inverted "annotation" wildcards (compatible:true + extra_clean)
  // contribute extra_clean hint only — surveyor must review.
  return { matched: false, compatible: false, extra_clean: wildcardExtraClean };
}

/**
 * Detect if cargo should be treated as break-bulk (bagged form).
 * Triggers on: form === 'bag' | 'breakbulk', OR name matches "in bags"
 * with whitespace OR hyphen separators ("wheat in bags", "wheat-in-bags").
 */
const BREAK_BULK_RE = /[\s-]in[\s-]bags\b/i;

function isBreakBulk(cargo: CargoInput): boolean {
  if (typeof cargo === 'string') {
    return BREAK_BULK_RE.test(cargo);
  }
  return cargo.form === 'bag' || cargo.form === 'breakbulk' ||
    BREAK_BULK_RE.test(cargo.name);
}

/** Strip the "in bags" suffix so contamination lookup uses the underlying commodity name. */
function stripBreakBulkSuffix(name: string): string {
  return name.replace(/[\s-]+in[\s-]+bags\s*$/i, '').trim() || name;
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
    // extra_clean hint accumulates from BOTH matched and unmatched lookups —
    // inverted wildcards (e.g. *→DRI) contribute the hint even when verdict
    // requires manual review.
    if (lookup.extra_clean) {
      requires_extra_clean = true;
    }
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
