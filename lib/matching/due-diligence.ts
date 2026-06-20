/**
 * Match «Due Diligence» panel — pure presentational model builder (server-only).
 *
 * Re-presents EXISTING stored match data as 5 grouped categories of check rows.
 * ZERO engine change: reads ONLY the stored-derived args passed in. It MUST NOT
 * import or call `computeFitBreakdown`, and MUST NOT read `sessionMatch.fitPercent`
 * / `sessionMatch.economics.tceUsdPerDay` — that would diverge from the persisted
 * (list==detail) values. `computeVesselVetting` and `checkCompatibility` are pure
 * presentation re-derivations on the SAME stored vessel/cargo snapshot the page
 * already uses — allowed; they do not touch scoring / regen.
 *
 * Honesty invariant: any null / absent source → `inactive` ("not connected / no
 * data"), NEVER a fake `pass`. The hero counter counts active checks only
 * (pass / caution / info) — inactive rows are excluded.
 */

import type {
  FitBreakdown,
  FitBreakdownComponent,
  FitFactor,
  MatchWorksheet,
  MatchSanctions,
  ParsedVessel,
} from '@/lib/types';
import { computeVesselVetting } from '@/lib/sailing/vessel-vetting';
import { checkCompatibility, parseLastCargoes } from '@/lib/cargo/l5c-matrix';
import { portCanHandleLOA } from '@/lib/sailing/port-master';

export type DDState = 'pass' | 'caution' | 'info' | 'inactive';

/**
 * Numeric, JSON-serializable payload for the "Laden draft" rows so the client
 * DDCheckRow can render the FULL laden-draft derivation (steps 1-3 + berth margin)
 * inside "Details". Display-only: `pass` echoes the STORED hardFilters.draft.pass
 * verdict, and `laden` mirrors the STORED estimatedLadenDraftM 1:1 when present
 * (recomputed with the engine formula only as a fallback). Intermediates
 * (fullLoadDraftM / ratio) are recomputed on the client from `dwt`/`cargoTons` —
 * never persisted, never fed back into the gate (parity invariant).
 */
export interface DraftDerivation {
  /** worksheet.vessel.dwtSummer */
  dwt: number;
  /** cargo.weightMtEffective ?? cargo.weightMt — worst-case max the engine used. */
  cargoTons: number;
  /** Stored estimatedLadenDraftM (1:1) or engine-parity recompute when absent. */
  laden: number;
  /** Stored hardFilters.*.portLimitM (NOT a live getPortMaster call). Null when absent. */
  portLimit: number | null;
  /** Stored hardFilters.*.pass — display verdict only. */
  pass: boolean;
}

export interface DDCheck {
  label: string;
  state: DDState;
  /** Living evidence — a real number / fact from the stored snapshot. Null when inactive. */
  evidence: string | null;
  /**
   * Plain-language demo disclosure ("Details"): what the check is, what we found,
   * and — for quantitative checks (has_calc) — a worked-calc line (inputs → op →
   * result) built from STORED fields only. Honesty caveats are baked in where the
   * engine number is not a 1:1 literal (war-risk excluded from TCE; nominal vs max
   * cargo). Null on plain gap rows (LOA / RightShip / KYC). Purely presentational —
   * never read by `counter` / `fitPercent` (parity invariant).
   */
  detail?: string | null;
  /** Short source badge (Equasis / Paris MoU / TCE calculation / …). Null on gap rows. */
  source?: string | null;
  /**
   * Draft rows only — numeric inputs so the client renders the full laden-draft
   * formula in "Details". Null when DWT/cargo are missing (no derivation possible)
   * or on non-draft rows. Purely presentational — never read by `counter` (parity).
   */
  derivation?: DraftDerivation | null;
}

export interface DDCategory {
  key: string;
  label: string;
  icon: string;
  checks: DDCheck[];
}

export interface DDModel {
  categories: DDCategory[];
  counter: { ran: number; pass: number; caution: number; info: number; flagsCritical: number };
  /** Echoes the passed stored fit-% verbatim — never recomputed (parity invariant). */
  fitPercent: number | null;
}

export interface BuildDDArgs {
  fitBreakdown: FitBreakdown | null;       // parsed from storedMatch.fit_breakdown
  fitPercent: number | null;               // storedMatch.fit_percent
  worksheet: MatchWorksheet | null;        // storedMatch.worksheet_json
  sanctions: MatchSanctions | null;        // worksheet.sanctions
  tceUsdPerDay: number | null;             // storedMatch.tce_usd_per_day
  breakevenTce: number | null;             // storedMatch.breakeven_tce_usd_per_day
  freightRateSource: string | null;        // storedMatch.freight_rate_source
  consumptionEstimated: boolean;           // storedMatch.consumption_estimated === 1
  vessel: ParsedVessel | null;             // for vetting re-derive + hold cleanliness
  cargoDescription: string | null;         // for hold cleanliness re-derive
  /** Age arithmetic for vetting; caller-supplied, defaults to current UTC year. */
  refYear?: number;
}

const PASS_THRESHOLD = 0.7;

function findComponent(
  fb: FitBreakdown | null,
  factor: FitFactor,
): FitBreakdownComponent | undefined {
  return fb?.components?.find((c) => c.factor === factor);
}

/** Map a fit-breakdown component to a state by its earned-vs-weight ratio. */
function componentState(c: FitBreakdownComponent | undefined): DDState {
  if (!c) return 'inactive';
  if (c.weight === 0) return 'inactive';
  const ratio = c.score / c.weight;
  return ratio >= PASS_THRESHOLD ? 'pass' : 'caution';
}

function componentEvidence(c: FitBreakdownComponent | undefined): string | null {
  if (!c) return null;
  return c.bracketData ? `${c.rationale} [${c.bracketData}]` : c.rationale;
}

/** A hard-filter check renders pass / caution / inactive (never excludes on detail page). */
function hardFilterState(hf: { pass: boolean; warning?: boolean } | undefined): DDState {
  if (!hf) return 'inactive';
  if (hf.pass === false) return 'caution';
  if (hf.warning) return 'caution';
  return 'pass';
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const INACTIVE = (label: string, note: string): DDCheck => ({
  label,
  state: 'inactive',
  evidence: note,
  detail: null,
  source: null,
});

// ── Worked-calc + detail copy ───────────────────────────────────────────────────
//
// All numbers come from STORED fields (bracketData / hardFilters / stored columns),
// NEVER recomputed — parity preserved. Formulas mirror docs/research/recon-dd-calc.
// Detail strings join lines with '\n' (DDCheckRow renders whitespace-pre-line).

function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** Source badges per check (recon Q2 map). */
const SRC = {
  draft: 'Circular + port-master.json',
  loa: 'Circular + port-master.json',
  letter: 'Vessel circular',
  l5c: 'L5C matrix',
  imsbc: 'IMSBC-Code',
  tce: 'TCE calculation',
  freight: 'Baltic index / vessel circular',
  fit: 'Fit-% model',
  parisMou: 'Paris MoU',
  iacs: 'IACS register',
  equasis: 'Equasis',
  pandi: 'IG P&I clubs',
  sanctions: 'OFAC/EU',
  jwc: 'JWC Area Lists',
} as const;

// CII has three possible provenances (vessel.ciiSource): a real IMO/Equasis rating
// ('imo-public'), an age/type estimate ('estimated'), or an AI guess ('llm-fallback').
// Mirror components/vessel/CiiRatingBadge.tsx — estimates must NOT claim Equasis.
// DISPLAY-only: scoring (scoreCii / counter / fitPercent) never reads this branch.
function ciiSourceBadge(src: string | null | undefined): string {
  if (src === 'estimated') return 'Оценка (возраст/тип судна)';
  if (src === 'llm-fallback') return 'Оценка ИИ';
  return SRC.equasis; // 'imo-public', null, or absent → real Equasis rating
}

function ciiDetailCopy(src: string | null | undefined): string {
  const tail =
    'A/B/C — в норме, D — внимание, E — повышенный риск эксплуатационных ограничений.';
  if (src === 'estimated') {
    return `Рейтинг углеродной интенсивности (CII, A–E) — оценка по возрасту/типу судна (не официальный рейтинг IMO). ${tail}`;
  }
  if (src === 'llm-fallback') {
    return `Рейтинг углеродной интенсивности (CII, A–E) — оценка ИИ (не официальный рейтинг IMO). ${tail}`;
  }
  return `Рейтинг углеродной интенсивности (CII, A–E) из Equasis. ${tail}`;
}

const BALLAST_RADIUS_NM: Record<string, number> = {
  handysize: 1500,
  supramax: 2000,
  panamax: 2500,
  capesize: 4000,
};

/** "Laden draft" worked-calc from stored hardFilters.draft / destDraft. */
function draftDetail(
  h: { estimatedLadenDraftM?: number; portLimitM?: number } | undefined,
): string {
  const base =
    'Checking whether the vessel fits the berth: estimated laden draft is compared against the berth draft limit from the port directory.';
  const caveat =
    'Draft estimate derived from DWT and load factor (screening); computed from the upper cargo range bound — not a precision draft calculation.';
  if (h?.estimatedLadenDraftM != null && h?.portLimitM != null) {
    const margin = Math.round((h.portLimitM - h.estimatedLadenDraftM) * 10) / 10;
    return `${base}\nCalc: laden draft ~${h.estimatedLadenDraftM}m vs berth limit ${h.portLimitM}m → margin ${margin}m.\n${caveat}`;
  }
  if (h?.estimatedLadenDraftM != null) {
    return `${base}\nCalc: laden draft ~${h.estimatedLadenDraftM}m; no berth limit in port directory.\n${caveat}`;
  }
  // No laden estimate stored → screening could not compute draft-in-cargo.
  return `${base}\nNo DWT/cargo data for laden-draft estimate — check uses vessel's stated max draft.\n${caveat}`;
}

/**
 * Numeric derivation payload for a draft row. Returns null when DWT/cargo are
 * absent (no step-by-step possible → row falls back to static-draft honesty copy).
 * `laden` = STORED estimate 1:1 when present (parity); else engine-parity recompute.
 */
function buildDraftDerivation(
  h: { pass: boolean; estimatedLadenDraftM?: number; portLimitM?: number } | undefined,
  dwt: number | null | undefined,
  cargoTons: number | null | undefined,
): DraftDerivation | null {
  if (!h) return null;
  if (dwt == null || cargoTons == null || dwt <= 0 || cargoTons <= 0) return null;
  let laden = h.estimatedLadenDraftM;
  if (laden == null) {
    const fullLoad = 0.4991 * Math.pow(dwt, 0.2991);
    const ratio = Math.min(cargoTons / dwt, 1);
    laden = Math.ceil(fullLoad * Math.pow(ratio, 0.3) * 10) / 10;
  }
  return { dwt, cargoTons, laden, portLimit: h.portLimitM ?? null, pass: h.pass };
}

/** "LOA vs berth" detail — what the gate is + screening caveat. */
function loaDetail(vesselLoaM: number, limitStr: string | null): string {
  const base =
    "Checking whether the vessel fits the berth by length (LOA): vessel LOA is compared against the berth's maximum LOA from the port directory.";
  const caveat =
    'Berth LOA limit sourced from port directory (not available for all ports; some Black Sea inland ports currently without data). Does not account for individual terminal restrictions.';
  if (limitStr) {
    return `${base}\nCalc: vessel LOA ${vesselLoaM}m vs berth limit ${limitStr}.\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/**
 * Task #8 — LOA-vs-berth berth-gate row. Re-derives the check on the SAME stored
 * snapshot (worksheet.vessel.loa + port-master maxLOA), like checkCompatibility —
 * parity-safe and robust to pre-gate persisted matches. Honesty: any missing data
 * → inactive (never fake-pass). Graceful pass everywhere data is absent.
 */
function buildLoaBerthRow(args: BuildDDArgs): DDCheck {
  const LABEL = 'LOA vs berth';
  const vesselLoa = args.worksheet?.vessel?.loa ?? null;
  const loadPort = args.worksheet?.cargo?.loadPort ?? null;
  const dischPort = args.worksheet?.cargo?.dischargePort ?? null;

  // Honesty: vessel LOA not parsed from the circular → inactive, never fake-pass.
  if (vesselLoa == null) {
    return { label: LABEL, state: 'inactive', evidence: 'Vessel LOA missing from circular — needs confirmation', detail: null, source: null };
  }

  const loadResult = portCanHandleLOA(loadPort, vesselLoa);
  const dischResult = portCanHandleLOA(dischPort, vesselLoa);
  const loadLimit = loadResult.portLoaM ?? null;
  const dischLimit = dischResult.portLoaM ?? null;

  // No berth LOA on either port → can't verify (graceful pass at the gate) → inactive on the panel.
  if (loadLimit == null && dischLimit == null) {
    return {
      label: LABEL,
      state: 'inactive',
      evidence: `Vessel LOA ${vesselLoa}m; no berth data — needs confirmation`,
      detail: null,
      source: null,
    };
  }

  const limitStr = [
    loadLimit != null ? `load max ${loadLimit}m` : null,
    dischLimit != null ? `disch max ${dischLimit}m` : null,
  ].filter(Boolean).join(' / ');

  const loadFail = !loadResult.ok ? loadResult : null;
  const dischFail = !dischResult.ok ? dischResult : null;
  const anyFail = loadFail || dischFail;

  if (anyFail) {
    let evidence: string;
    if (loadFail && dischFail) {
      const reasons = [loadFail.reason, dischFail.reason].filter(Boolean);
      evidence = reasons.length > 0
        ? reasons.join(' / ')
        : `Vessel LOA ${vesselLoa}m exceeds both berth limits`;
    } else {
      evidence = anyFail.reason ?? `Vessel LOA ${vesselLoa}m exceeds berth limit`;
    }
    return {
      label: LABEL,
      state: 'caution',
      evidence,
      detail: loaDetail(vesselLoa, limitStr || null),
      source: SRC.loa,
    };
  }
  return {
    label: LABEL,
    state: 'pass',
    evidence: `Vessel LOA ${vesselLoa}m vs berth limit (${limitStr})`,
    detail: loaDetail(vesselLoa, limitStr || null),
    source: SRC.loa,
  };
}

/** "DWT utilisation" worked-calc from stored bracketData "X / Y mt". */
function utilDetail(c: FitBreakdownComponent | undefined): string {
  const base = "DWT utilisation — what share of the vessel's carrying capacity the cargo occupies.";
  const caveat =
    'Capacity = DWCC (deadweight cargo capacity) when specified, otherwise DWT. Cargo weight is the nominal figure from the circular; draft and volume are computed from the upper bound of the range.';
  const m = c?.bracketData?.match(/([\d,]+)\s*\/\s*([\d,]+)\s*mt/i);
  if (m) {
    const cargo = Number(m[1].replace(/,/g, ''));
    const cap = Number(m[2].replace(/,/g, ''));
    if (cargo > 0 && cap > 0) {
      const pct = Math.round((cargo / cap) * 100);
      return `${base}\nCalc: cargo ${num(cargo)} mt ÷ capacity ${num(cap)} mt = ${pct}% → ${c!.rationale}\n${caveat}`;
    }
  }
  return `${base}\n${caveat}`;
}

/** "Cargo volume vs holds" worked-calc from stored bracketData "N% of grain". */
function volumeDetail(c: FitBreakdownComponent | undefined): string {
  const base =
    'Checking whether the cargo fits by VOLUME: weight × stowage factor compared against grain capacity of the holds.';
  const caveat =
    'Stowage factor taken from the circular; if absent, estimated by cargo type.';
  const m = c?.bracketData?.match(/([\d.]+)\s*%/);
  if (m) {
    return `${base}\nCalc: cargo occupies ~${m[1]}% of hold volume (grain capacity).\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/** "Ballast leg" worked-calc from stored bracketData "~N nm" + vesselClass radius. */
function ballastDetail(
  c: FitBreakdownComponent | undefined,
  vesselClass: string | undefined,
): string {
  const base =
    "Ballast leg — distance from the vessel's current position to the load port (vessel sailing without cargo).";
  const caveat =
    'Ballast-leg bunker is included in the TCE figure and not shown separately here. Distance is a port-table lookup — approximate.';
  const m = c?.bracketData?.match(/~?\s*([\d,]+)\s*nm/i);
  const cls = vesselClass?.toLowerCase();
  const r = cls ? BALLAST_RADIUS_NM[cls] : undefined;
  if (m && r) {
    return `${base}\nCalc: ballast leg ~${m[1]} nm vs class radius ~${num(r)} nm (${cls}) → ${c!.rationale}\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/** "TCE vs breakeven" worked-calc from stored tce / breakeven columns. */
function tceDetail(tce: number, breakeven: number | null): string {
  const base =
    "TCE (Time Charter Equivalent) — daily voyage return net of port costs and bunker. Compared against the owner's breakeven: above → voyage profitable, below → loss-making.";
  const caveat =
    'War-risk premium is shown separately in the breakdown — it is NOT included in this figure. ' +
    'Commission (address + brokerage, rate from circular or 3.75% TTL default) has been DEDUCTED from freight — TCE shown here is net-of-commission.';
  if (breakeven != null) {
    const diff = tce - breakeven;
    const sign = diff >= 0 ? '+' : '−';
    const verdict = diff >= 0 ? 'above breakeven' : 'below breakeven';
    return `${base}\nCalc: TCE ${usd(tce)}/day − breakeven ${usd(breakeven)}/day = ${sign}${usd(Math.abs(diff))}/day → ${verdict}.\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/** "Vessel age" worked-calc from stored vessel.built + refYear. */
function ageDetail(built: number | null | undefined, refYear: number, rationale: string): string {
  const base =
    'Vessel age: reference year minus build year. Under 15 years — modern; 15–22 — mature (higher maintenance risk); over 22 — elevated detention and off-hire risk.';
  if (built != null) {
    return `${base}\nCalc: ${refYear} − ${built} = ${refYear - built} years → ${rationale}`;
  }
  return base;
}

/** Lookup (has_calc=false) vetting detail + source, keyed by VettingFactor.key. */
const VETTING_LOOKUP: Record<string, { detail: string; source: string }> = {
  flag: {
    source: SRC.parisMou,
    detail:
      'Vessel flag is checked against the Paris MoU list (inter-governmental Memorandum of Understanding on Port State Control). Grey/black-listed flag = elevated risk of port detentions.',
  },
  class: {
    source: SRC.iacs,
    detail:
      'Classification society is checked for IACS membership (International Association of Classification Societies). Non-IACS class = elevated technical risk.',
  },
  pandi: {
    source: SRC.pandi,
    detail:
      'P&I insurer is checked for membership in the International Group — the pool of leading clubs with robust coverage.',
  },
  psc: {
    source: SRC.equasis,
    detail:
      "Vessel's port-state-control (PSC) detention history from Equasis. Recent detentions = elevated inspection risk.",
  },
  cii: {
    source: SRC.equasis,
    detail:
      'Carbon Intensity Indicator (CII, A–E) from Equasis. A/B/C — within norms; D — attention; E — elevated risk of operational restrictions.',
  },
};

// ── Category builders ──────────────────────────────────────────────────────────

function buildVesselPort(args: BuildDDArgs): DDCategory {
  const hf = args.worksheet?.hardFilters;
  const fbDraft = findComponent(args.fitBreakdown, 'draft');
  const fbCranes = findComponent(args.fitBreakdown, 'cranes');

  // Formula inputs for the laden-draft derivation (display-only). cargoTons uses the
  // worst-case effective max — the same value the engine fed estimateLadenDraft.
  const dwt = args.worksheet?.vessel?.dwtSummer ?? null;
  const cargoTons =
    args.worksheet?.cargo?.weightMtEffective ?? args.worksheet?.cargo?.weightMt ?? null;

  const draftEvidence = (
    h: { reason?: string; estimatedLadenDraftM?: number; portLimitM?: number } | undefined,
  ): string | null => {
    if (!h) return null;
    if (h.estimatedLadenDraftM != null && h.portLimitM != null) {
      return `Laden draft ~${h.estimatedLadenDraftM}m vs berth draft limit ${h.portLimitM}m`;
    }
    return h.reason ?? componentEvidence(fbDraft);
  };

  const draftRow = (
    label: string,
    h: { pass: boolean; warning?: boolean; reason?: string; estimatedLadenDraftM?: number; portLimitM?: number } | undefined,
  ): DDCheck => {
    const state = hardFilterState(h);
    const active = state !== 'inactive';
    return {
      label,
      state,
      evidence: draftEvidence(h),
      detail: active ? draftDetail(h) : null,
      source: active ? SRC.draft : null,
      derivation: active ? buildDraftDerivation(h, dwt, cargoTons) : null,
    };
  };

  const craneState = hardFilterState(hf?.crane);
  const craneActive = craneState !== 'inactive';

  return {
    key: 'vessel-port',
    label: 'Vessel ↔ port',
    icon: 'ship',
    checks: [
      draftRow('Laden draft — load port', hf?.draft),
      draftRow('Laden draft — discharge port', hf?.destDraft),
      {
        label: 'Cranes / cargo gear',
        state: craneState,
        evidence: hf?.crane?.reason ?? componentEvidence(fbCranes),
        detail: craneActive
          ? 'Checking whether the vessel has its own cranes/derricks for ports without shore gear. Source: vessel circular.'
          : null,
        source: craneActive ? SRC.letter : null,
      },
      buildLoaBerthRow(args),
      INACTIVE('Air draught clearance', 'no data'),
    ],
  };
}

function buildCargoHolds(args: BuildDDArgs): DDCategory {
  const fbVolume = findComponent(args.fitBreakdown, 'volume');
  const fbCargoType = findComponent(args.fitBreakdown, 'cargoType');
  const imsbc = args.worksheet?.hardFilters?.imsbc;

  const HOLD_LABEL = 'Hold cleanliness / prior cargo';
  // Founder-locked honesty copy when the circular never carried last cargoes (~96%).
  // The inactive row STILL explains itself — never a glued "no data", never fake-pass.
  const holdNoData: DDCheck = {
    label: HOLD_LABEL,
    state: 'inactive',
    evidence: 'Not in circular — confirm with owner/broker',
    detail:
      'Prior cargo not listed in the vessel circular (typical for ~96% of circulars). When available, we check compatibility with the current cargo via the L5C matrix (cross-contamination risk, hold-cleaning requirements). Action: confirm with owner/broker.',
    source: SRC.l5c,
  };
  const holdBase =
    "Checking vessel's last cargoes for compatibility with the current cargo via the L5C matrix (cross-contamination risk, hold-cleaning requirements). Source: prior-cargo field from vessel circular.";

  // Hold cleanliness — re-derived from the SAME stored vessel/cargo snapshot.
  // Honesty: missing last cargoes OR missing cargo description → inactive, never pass.
  let holdCheck: DDCheck;
  const lastCargoes = args.vessel?.lastCargoes ?? null;
  if (!lastCargoes || !args.cargoDescription) {
    holdCheck = holdNoData;
  } else {
    const prev = parseLastCargoes(lastCargoes);
    if (prev.length === 0) {
      holdCheck = holdNoData;
    } else {
      const r = checkCompatibility(prev, args.cargoDescription);
      if (!r.compatible) {
        const reasons = r.blocking_pairs.map((b) => `${b.previous}: ${b.reason}`).join('; ');
        holdCheck = { label: HOLD_LABEL, state: 'caution', evidence: reasons || 'incompatible prior cargo', detail: holdBase, source: SRC.l5c };
      } else if (r.requires_extra_clean) {
        holdCheck = { label: HOLD_LABEL, state: 'caution', evidence: `Prior cargo: ${prev.join(', ')} — extra cleaning required`, detail: holdBase, source: SRC.l5c };
      } else {
        holdCheck = { label: HOLD_LABEL, state: 'pass', evidence: `Prior cargo: ${prev.join(', ')} — compatible`, detail: holdBase, source: SRC.l5c };
      }
    }
  }

  const imsbcCheck: DDCheck = imsbc
    ? {
        label: 'IMSBC group',
        state: imsbc.pass === false || imsbc.warning ? 'caution' : 'info',
        evidence: imsbc.reason ?? null,
        detail:
          'Checking cargo against the IMSBC Code (International Maritime Solid Bulk Cargoes): Group A/B/C classification, carriage requirements, and vessel restrictions.',
        source: SRC.imsbc,
      }
    : INACTIVE('IMSBC group', 'no data');

  const volumeState = componentState(fbVolume);
  const cargoTypeState = componentState(fbCargoType);

  return {
    key: 'cargo-holds',
    label: 'Cargo ↔ holds',
    icon: 'package',
    checks: [
      {
        label: 'Cargo volume vs holds',
        state: volumeState,
        evidence: componentEvidence(fbVolume),
        detail: volumeState !== 'inactive' ? volumeDetail(fbVolume) : null,
        source: volumeState !== 'inactive' ? SRC.letter : null,
      },
      {
        label: 'Cargo type ↔ vessel type',
        state: cargoTypeState,
        evidence: componentEvidence(fbCargoType),
        detail: cargoTypeState !== 'inactive'
          ? 'Checking cargo type compatibility with vessel type and design (bulker/tweendecker etc.). Source: vessel circular.'
          : null,
        source: cargoTypeState !== 'inactive' ? SRC.letter : null,
      },
      holdCheck,
      imsbcCheck,
    ],
  };
}

function buildEconomics(args: BuildDDArgs): DDCategory {
  const fbEconomics = findComponent(args.fitBreakdown, 'economics');
  const fbUtil = findComponent(args.fitBreakdown, 'utilisation');
  const fbBallast = findComponent(args.fitBreakdown, 'ballast');

  // TCE vs breakeven — stored single source (list==detail parity).
  let tceCheck: DDCheck;
  if (args.tceUsdPerDay == null) {
    tceCheck = INACTIVE('TCE vs breakeven', 'no data');
  } else if (args.breakevenTce == null) {
    tceCheck = {
      label: 'TCE vs breakeven',
      state: componentState(fbEconomics),
      evidence: `TCE ${usd(args.tceUsdPerDay)}/day` + (fbEconomics ? ` — ${fbEconomics.rationale}` : ''),
      detail: tceDetail(args.tceUsdPerDay, null),
      source: SRC.tce,
    };
  } else {
    const diff = args.tceUsdPerDay - args.breakevenTce;
    tceCheck = {
      label: 'TCE vs breakeven',
      state: diff >= 0 ? 'pass' : 'caution',
      evidence: `TCE ${usd(args.tceUsdPerDay)}/day — ${usd(Math.abs(diff))}/day ${diff >= 0 ? 'above' : 'below'} breakeven`,
      detail: tceDetail(args.tceUsdPerDay, args.breakevenTce),
      source: SRC.tce,
    };
  }

  // Freight rate source — estimates carry a caution badge; parsed/manual is neutral info.
  let freightCheck: DDCheck;
  const src = args.freightRateSource;
  if (!src) {
    freightCheck = INACTIVE('Freight vs Baltic', 'no data');
  } else {
    const estimated = src === 'baltic' || src === 'estimated';
    const note = args.consumptionEstimated ? ' · consumption estimated' : '';
    freightCheck = {
      label: 'Freight vs Baltic',
      state: estimated ? 'caution' : 'info',
      evidence: `Freight rate: ${src}${estimated ? ' (estimate)' : ''}${note}`,
      detail:
        'Freight rate source: manually entered from the circular (manual/parsed) or estimated from the Baltic index / seed. Estimated rate → approximate figure, flagged as "(estimate)".',
      source: SRC.freight,
    };
  }

  const fbEconState = componentState(fbEconomics);
  const fbUtilState = componentState(fbUtil);
  const fbBallastState = componentState(fbBallast);
  const vesselClass = args.fitBreakdown?.vesselClass;

  return {
    key: 'economics',
    label: 'Voyage economics',
    icon: 'coin',
    checks: [
      tceCheck,
      {
        label: 'Voyage economics (fit)',
        state: fbEconState,
        evidence: componentEvidence(fbEconomics),
        detail: fbEconState !== 'inactive'
          ? 'Voyage economics contribution to the overall fit-%: how profitable this voyage is relative to alternatives for this vessel class.'
          : null,
        source: fbEconState !== 'inactive' ? SRC.tce : null,
      },
      {
        label: 'DWT utilisation',
        state: fbUtilState,
        evidence: componentEvidence(fbUtil),
        detail: fbUtilState !== 'inactive' ? utilDetail(fbUtil) : null,
        source: fbUtilState !== 'inactive' ? SRC.tce : null,
      },
      {
        label: 'Ballast leg',
        state: fbBallastState,
        evidence: componentEvidence(fbBallast),
        detail: fbBallastState !== 'inactive' ? ballastDetail(fbBallast, vesselClass) : null,
        source: fbBallastState !== 'inactive' ? SRC.tce : null,
      },
      freightCheck,
    ],
  };
}

function buildVetting(args: BuildDDArgs): DDCategory {
  const fbVetting = findComponent(args.fitBreakdown, 'vetting');
  const fbClass = findComponent(args.fitBreakdown, 'classFit');
  const fbTiming = findComponent(args.fitBreakdown, 'timing');
  const refYear = args.refYear ?? new Date().getUTCFullYear();

  const checks: DDCheck[] = [];

  if (args.vessel) {
    const vetting = computeVesselVetting(args.vessel, { refYear });
    for (const f of vetting.factors) {
      const state: DDState =
        f.verdict === 'ok' ? 'pass'
        : f.verdict === 'caution' || f.verdict === 'warn' ? 'caution'
        : 'inactive'; // unknown → honesty: no data on this vessel
      if (state === 'inactive') {
        checks.push({ label: f.label, state, evidence: 'no vessel data', detail: null, source: null });
        continue;
      }
      // age is the one quantitative vetting factor (refYear − built); the rest are lookups.
      const detail =
        f.key === 'age'
          ? ageDetail(args.vessel.built, refYear, f.rationale)
          : f.key === 'cii'
            ? ciiDetailCopy(args.vessel.ciiSource)
            : VETTING_LOOKUP[f.key]?.detail ?? null;
      const source =
        f.key === 'cii'
          ? ciiSourceBadge(args.vessel.ciiSource)
          : f.key === 'age'
            ? SRC.equasis
            : VETTING_LOOKUP[f.key]?.source ?? null;
      checks.push({ label: f.label, state, evidence: f.rationale, detail, source });
    }
  } else {
    // No live vessel snapshot — fall back to the rolled-up vetting component.
    const rollState = componentState(fbVetting);
    checks.push({
      label: 'Vessel vetting (summary)',
      state: rollState,
      evidence: componentEvidence(fbVetting),
      detail: rollState !== 'inactive'
        ? 'Rolled-up vessel vetting assessment (flag, class, age, P&I, PSC, CII) — per-factor breakdown not available for this snapshot.'
        : null,
      source: rollState !== 'inactive' ? SRC.equasis : null,
    });
  }

  // Timing readiness — fb timing component, or readiness verdict as a fallback.
  const timingDetail =
    "Vessel readiness for laycan: we compare the open date and ballast passage to the load port against the cargo's laycan window. Source: vessel circular.";
  let timingCheck: DDCheck;
  if (fbTiming) {
    const ts = componentState(fbTiming);
    timingCheck = {
      label: 'Readiness / timing',
      state: ts,
      evidence: componentEvidence(fbTiming),
      detail: ts !== 'inactive' ? timingDetail : null,
      source: ts !== 'inactive' ? SRC.letter : null,
    };
  } else if (args.worksheet?.readiness?.verdict) {
    timingCheck = {
      label: 'Readiness / timing',
      state: 'info',
      evidence: `Readiness: ${args.worksheet.readiness.verdict}`,
      detail: timingDetail,
      source: SRC.letter,
    };
  } else {
    timingCheck = INACTIVE('Readiness / timing', 'no data');
  }

  const classState = componentState(fbClass);
  checks.push({
    label: 'Vessel class (fit)',
    state: classState,
    evidence: componentEvidence(fbClass),
    detail: classState !== 'inactive'
      ? 'How well the vessel class (handysize/supramax/panamax/capesize) matches cargo and voyage parameters — its contribution to the overall fit-%.'
      : null,
    source: classState !== 'inactive' ? SRC.fit : null,
  });
  checks.push(timingCheck);
  checks.push(INACTIVE('RightShip score', 'not connected'));

  return { key: 'vetting', label: 'Vessel vetting', icon: 'shield-check', checks };
}

function buildCompliance(args: BuildDDArgs): DDCategory {
  const sanctions = args.sanctions;
  const war = args.worksheet?.hardFilters?.warPositionVoyage;

  let sanctionsCheck: DDCheck;
  if (!sanctions) {
    sanctionsCheck = INACTIVE('Vessel sanctions (OFAC/EU)', 'no data');
  } else {
    const clean = sanctions.risk === 'NONE' || sanctions.risk === 'LOW';
    sanctionsCheck = {
      label: 'Vessel sanctions (OFAC/EU)',
      state: !clean || sanctions.blocking ? 'caution' : 'pass',
      evidence: sanctions.reason ?? `Sanctions risk: ${sanctions.risk}`,
      detail:
        'Checking vessel, owner, and manager against OFAC (US) and EU sanctions lists. A blocking flag prevents the voyage. Data from the sanctions layer as of the matching timestamp.',
      source: SRC.sanctions,
    };
  }

  const warState = war ? hardFilterState(war) : 'inactive';
  const warCheck: DDCheck = war
    ? {
        label: 'War-risk / JWC',
        state: warState,
        evidence: war.reason ?? null,
        detail: warState !== 'inactive'
          ? 'Checking whether the vessel position or voyage passes through JWC (Joint War Committee) war-risk zones. Entry into a zone = war-risk surcharge and elevated risk. War-risk cost is shown separately in the TCE breakdown.'
          : null,
        source: warState !== 'inactive' ? SRC.jwc : null,
      }
    : INACTIVE('War-risk / JWC', 'no data');

  return {
    key: 'compliance',
    label: 'Compliance / risk',
    icon: 'scale',
    checks: [
      sanctionsCheck,
      warCheck,
      INACTIVE('Charterer KYC', 'not connected'),
    ],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function buildDueDiligence(args: BuildDDArgs): DDModel {
  const categories: DDCategory[] = [
    buildVesselPort(args),
    buildCargoHolds(args),
    buildEconomics(args),
    buildVetting(args),
    buildCompliance(args),
  ];

  const allChecks = categories.flatMap((c) => c.checks);
  const active = allChecks.filter((c) => c.state !== 'inactive');
  const counter = {
    ran: active.length,
    pass: allChecks.filter((c) => c.state === 'pass').length,
    caution: allChecks.filter((c) => c.state === 'caution').length,
    info: allChecks.filter((c) => c.state === 'info').length,
    // A blocking sanction would have removed this pair from the board — rare on a
    // detail page (the row exists because it survived), usually 0.
    flagsCritical: args.sanctions?.blocking ? 1 : 0,
  };

  // Parity invariant: echo the passed stored fit-% verbatim, never recompute.
  return { categories, counter, fitPercent: args.fitPercent };
}
