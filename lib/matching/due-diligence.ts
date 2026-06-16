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
 * Honesty invariant: any null / absent source → `inactive` («не подключено / нет
 * данных»), NEVER a fake `pass`. The hero counter counts active checks only
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

export type DDState = 'pass' | 'caution' | 'info' | 'inactive';

export interface DDCheck {
  label: string;
  state: DDState;
  /** Living evidence — a real number / fact from the stored snapshot. Null when inactive. */
  evidence: string | null;
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
});

// ── Category builders ──────────────────────────────────────────────────────────

function buildVesselPort(args: BuildDDArgs): DDCategory {
  const hf = args.worksheet?.hardFilters;
  const fbDraft = findComponent(args.fitBreakdown, 'draft');
  const fbCranes = findComponent(args.fitBreakdown, 'cranes');

  const draftEvidence = (
    h: { reason?: string; estimatedLadenDraftM?: number; portLimitM?: number } | undefined,
  ): string | null => {
    if (!h) return null;
    if (h.estimatedLadenDraftM != null && h.portLimitM != null) {
      return `Осадка в грузу ~${h.estimatedLadenDraftM}m vs лимит причала ${h.portLimitM}m`;
    }
    return h.reason ?? componentEvidence(fbDraft);
  };

  return {
    key: 'vessel-port',
    label: 'Судно ↔ порт',
    icon: 'ship',
    checks: [
      { label: 'Осадка — порт погрузки', state: hardFilterState(hf?.draft), evidence: draftEvidence(hf?.draft) },
      { label: 'Осадка — порт выгрузки', state: hardFilterState(hf?.destDraft), evidence: draftEvidence(hf?.destDraft) },
      {
        label: 'Краны / грузовое оборудование',
        state: hardFilterState(hf?.crane),
        evidence: hf?.crane?.reason ?? componentEvidence(fbCranes),
      },
      INACTIVE('LOA под причал', 'не подключено'),
      INACTIVE('Воздушный габарит', 'нет данных'),
    ],
  };
}

function buildCargoHolds(args: BuildDDArgs): DDCategory {
  const fbVolume = findComponent(args.fitBreakdown, 'volume');
  const fbCargoType = findComponent(args.fitBreakdown, 'cargoType');
  const imsbc = args.worksheet?.hardFilters?.imsbc;

  // Hold cleanliness — re-derived from the SAME stored vessel/cargo snapshot.
  // Honesty: missing last cargoes OR missing cargo description → inactive, never pass.
  let holdCheck: DDCheck;
  const lastCargoes = args.vessel?.lastCargoes ?? null;
  if (!lastCargoes || !args.cargoDescription) {
    holdCheck = INACTIVE('Чистота трюмов / прошлый груз', 'нет данных в письме');
  } else {
    const prev = parseLastCargoes(lastCargoes);
    if (prev.length === 0) {
      holdCheck = INACTIVE('Чистота трюмов / прошлый груз', 'нет данных в письме');
    } else {
      const r = checkCompatibility(prev, args.cargoDescription);
      if (!r.compatible) {
        const reasons = r.blocking_pairs.map((b) => `${b.previous}: ${b.reason}`).join('; ');
        holdCheck = { label: 'Чистота трюмов / прошлый груз', state: 'caution', evidence: reasons || 'несовместимый прошлый груз' };
      } else if (r.requires_extra_clean) {
        holdCheck = { label: 'Чистота трюмов / прошлый груз', state: 'caution', evidence: `Прошлый груз: ${prev.join(', ')} — требуется доп. зачистка` };
      } else {
        holdCheck = { label: 'Чистота трюмов / прошлый груз', state: 'pass', evidence: `Прошлый груз: ${prev.join(', ')} — совместимо` };
      }
    }
  }

  const imsbcCheck: DDCheck = imsbc
    ? {
        label: 'IMSBC группа',
        state: imsbc.pass === false || imsbc.warning ? 'caution' : 'info',
        evidence: imsbc.reason ?? null,
      }
    : INACTIVE('IMSBC группа', 'нет данных');

  return {
    key: 'cargo-holds',
    label: 'Груз ↔ трюмы',
    icon: 'package',
    checks: [
      { label: 'Объём груза под трюмы', state: componentState(fbVolume), evidence: componentEvidence(fbVolume) },
      { label: 'Тип груза ↔ тип судна', state: componentState(fbCargoType), evidence: componentEvidence(fbCargoType) },
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
    tceCheck = INACTIVE('TCE vs breakeven', 'нет данных');
  } else if (args.breakevenTce == null) {
    tceCheck = {
      label: 'TCE vs breakeven',
      state: componentState(fbEconomics),
      evidence: `TCE ${usd(args.tceUsdPerDay)}/day` + (fbEconomics ? ` — ${fbEconomics.rationale}` : ''),
    };
  } else {
    const diff = args.tceUsdPerDay - args.breakevenTce;
    tceCheck = {
      label: 'TCE vs breakeven',
      state: diff >= 0 ? 'pass' : 'caution',
      evidence: `TCE ${usd(args.tceUsdPerDay)}/day — ${usd(Math.abs(diff))}/day ${diff >= 0 ? 'выше' : 'ниже'} breakeven`,
    };
  }

  // Freight rate source — estimates carry a caution badge; parsed/manual is neutral info.
  let freightCheck: DDCheck;
  const src = args.freightRateSource;
  if (!src) {
    freightCheck = INACTIVE('Фрахт vs Baltic', 'нет данных');
  } else {
    const estimated = src === 'baltic' || src === 'estimated';
    const note = args.consumptionEstimated ? ' · расход оценён' : '';
    freightCheck = {
      label: 'Фрахт vs Baltic',
      state: estimated ? 'caution' : 'info',
      evidence: `Ставка фрахта: ${src}${estimated ? ' (оценка)' : ''}${note}`,
    };
  }

  return {
    key: 'economics',
    label: 'Экономика рейса',
    icon: 'coin',
    checks: [
      tceCheck,
      { label: 'Экономика рейса (фит)', state: componentState(fbEconomics), evidence: componentEvidence(fbEconomics) },
      { label: 'Утилизация DWT', state: componentState(fbUtil), evidence: componentEvidence(fbUtil) },
      { label: 'Балласт-переход', state: componentState(fbBallast), evidence: componentEvidence(fbBallast) },
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
      checks.push({ label: f.label, state, evidence: state === 'inactive' ? 'нет данных по судну' : f.rationale });
    }
  } else {
    // No live vessel snapshot — fall back to the rolled-up vetting component.
    checks.push({
      label: 'Ветинг судна (сводно)',
      state: componentState(fbVetting),
      evidence: componentEvidence(fbVetting),
    });
  }

  // Timing readiness — fb timing component, or readiness verdict as a fallback.
  let timingCheck: DDCheck;
  if (fbTiming) {
    timingCheck = { label: 'Готовность / тайминг', state: componentState(fbTiming), evidence: componentEvidence(fbTiming) };
  } else if (args.worksheet?.readiness?.verdict) {
    timingCheck = { label: 'Готовность / тайминг', state: 'info', evidence: `Готовность: ${args.worksheet.readiness.verdict}` };
  } else {
    timingCheck = INACTIVE('Готовность / тайминг', 'нет данных');
  }

  checks.push({ label: 'Класс судна (фит)', state: componentState(fbClass), evidence: componentEvidence(fbClass) });
  checks.push(timingCheck);
  checks.push(INACTIVE('RightShip score', 'не подключено'));

  return { key: 'vetting', label: 'Ветинг судна', icon: 'shield-check', checks };
}

function buildCompliance(args: BuildDDArgs): DDCategory {
  const sanctions = args.sanctions;
  const war = args.worksheet?.hardFilters?.warPositionVoyage;

  let sanctionsCheck: DDCheck;
  if (!sanctions) {
    sanctionsCheck = INACTIVE('Санкции судна (OFAC/EU)', 'нет данных');
  } else {
    const clean = sanctions.risk === 'NONE' || sanctions.risk === 'LOW';
    sanctionsCheck = {
      label: 'Санкции судна (OFAC/EU)',
      state: !clean || sanctions.blocking ? 'caution' : 'pass',
      evidence: sanctions.reason ?? `Sanctions risk: ${sanctions.risk}`,
    };
  }

  const warCheck: DDCheck = war
    ? { label: 'War-risk / JWC', state: hardFilterState(war), evidence: war.reason ?? null }
    : INACTIVE('War-risk / JWC', 'нет данных');

  return {
    key: 'compliance',
    label: 'Комплаенс / риск',
    icon: 'scale',
    checks: [
      sanctionsCheck,
      warCheck,
      INACTIVE('KYC чартерера', 'не подключено'),
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
