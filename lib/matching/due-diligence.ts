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
import { portCanHandleLOA } from '@/lib/sailing/port-master';

export type DDState = 'pass' | 'caution' | 'info' | 'inactive';

/**
 * Numeric, JSON-serializable payload for the "Осадка в грузу" rows so the client
 * DDCheckRow can render the FULL laden-draft derivation (steps 1-3 + berth margin)
 * inside «Подробнее». Display-only: `pass` echoes the STORED hardFilters.draft.pass
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
   * Plain-language demo disclosure («Подробнее»): what the check is, what we found,
   * and — for quantitative checks (has_calc) — a worked-calc line (inputs → op →
   * result) built from STORED fields only. Honesty caveats are baked in where the
   * engine number is not a 1:1 literal (war-risk excluded from TCE; nominal vs max
   * cargo). Null on plain gap rows (LOA / RightShip / KYC). Purely presentational —
   * never read by `counter` / `fitPercent` (parity invariant).
   */
  detail?: string | null;
  /** Short source badge (Equasis / Paris MoU / Расчёт TCE / …). Null on gap rows. */
  source?: string | null;
  /**
   * Draft rows only — numeric inputs so the client renders the full laden-draft
   * formula in «Подробнее». Null when DWT/cargo are missing (no derivation possible)
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
  draft: 'Исходное письмо + port-master.json',
  loa: 'Исходное письмо + port-master.json',
  letter: 'Исходное письмо',
  l5c: 'L5C-матрица',
  imsbc: 'IMSBC-Code',
  tce: 'Расчёт TCE',
  freight: 'Baltic-сид / исходное письмо',
  fit: 'Расчёт фит-%',
  parisMou: 'Paris MoU',
  iacs: 'Реестр IACS',
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

/** "Осадка в грузу" worked-calc from stored hardFilters.draft / destDraft. */
function draftDetail(
  h: { estimatedLadenDraftM?: number; portLimitM?: number } | undefined,
): string {
  const base =
    'Проверяем, войдёт ли судно под причал: расчётную осадку судна в грузу сравниваем с допустимым лимитом причала из реестра портов.';
  const caveat =
    'Оценка осадки по DWT и загрузке (скрининг), считается от верхней границы груза — не точный расчёт осадки.';
  if (h?.estimatedLadenDraftM != null && h?.portLimitM != null) {
    const margin = Math.round((h.portLimitM - h.estimatedLadenDraftM) * 10) / 10;
    return `${base}\nРасчёт: осадка в грузу ~${h.estimatedLadenDraftM}m vs лимит причала ${h.portLimitM}m → запас ${margin}m.\n${caveat}`;
  }
  if (h?.estimatedLadenDraftM != null) {
    return `${base}\nРасчёт: осадка в грузу ~${h.estimatedLadenDraftM}m; лимит причала не задан в реестре портов.\n${caveat}`;
  }
  // No laden estimate stored → screening could not compute draft-in-cargo.
  return `${base}\nНет данных DWT/груза для расчёта осадки в грузу — проверка по заявленной статической осадке судна.\n${caveat}`;
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

/** "LOA под причал" detail — what the gate is + screening caveat. */
function loaDetail(vesselLoaM: number, limitStr: string | null): string {
  const base =
    'Проверяем, влезет ли судно по длине (LOA) под причал: длину судна сравниваем с максимальной длиной у причала из реестра портов.';
  const caveat =
    'Лимит LOA причала — из реестра портов (есть не у всех портов; черноморские внутренние порты пока без данных). Не учитывает индивидуальные ограничения конкретного терминала.';
  if (limitStr) {
    return `${base}\nРасчёт: LOA судна ${vesselLoaM}m vs лимит причала ${limitStr}.\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/**
 * Task #8 — LOA-под-причал berth-gate row. Re-derives the check on the SAME stored
 * snapshot (worksheet.vessel.loa + port-master maxLOA), like checkCompatibility —
 * parity-safe and robust to pre-gate persisted matches. Honesty: any missing data
 * → inactive (never fake-pass). Graceful pass everywhere data is absent.
 */
function buildLoaBerthRow(args: BuildDDArgs): DDCheck {
  const LABEL = 'LOA под причал';
  const vesselLoa = args.worksheet?.vessel?.loa ?? null;
  const loadPort = args.worksheet?.cargo?.loadPort ?? null;
  const dischPort = args.worksheet?.cargo?.dischargePort ?? null;

  // Honesty: vessel LOA not parsed from the circular → inactive, never fake-pass.
  if (vesselLoa == null) {
    return { label: LABEL, state: 'inactive', evidence: 'LOA судна нет в исходном письме — нужно уточнить', detail: null, source: null };
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
      evidence: `LOA судна ${vesselLoa}m; нет данных по причалу — нужно уточнить`,
      detail: null,
      source: null,
    };
  }

  const limitStr = [
    loadLimit != null ? `погрузка max ${loadLimit}m` : null,
    dischLimit != null ? `выгрузка max ${dischLimit}m` : null,
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
        : `LOA судна ${vesselLoa}m превышает лимит обоих причалов`;
    } else {
      evidence = anyFail.reason ?? `LOA судна ${vesselLoa}m превышает лимит причала`;
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
    evidence: `LOA судна ${vesselLoa}m vs лимит причала (${limitStr})`,
    detail: loaDetail(vesselLoa, limitStr || null),
    source: SRC.loa,
  };
}

/** "Утилизация DWT" worked-calc from stored bracketData "X / Y mt". */
function utilDetail(c: FitBreakdownComponent | undefined): string {
  const base = 'Утилизация — какую долю грузоподъёмности судна занимает груз.';
  const caveat =
    'Вместимость = DWCC (полезная грузоподъёмность), если задана, иначе DWT. Вес груза — номинал из письма; осадка и объём считаются от верхней границы диапазона.';
  const m = c?.bracketData?.match(/([\d,]+)\s*\/\s*([\d,]+)\s*mt/i);
  if (m) {
    const cargo = Number(m[1].replace(/,/g, ''));
    const cap = Number(m[2].replace(/,/g, ''));
    if (cargo > 0 && cap > 0) {
      const pct = Math.round((cargo / cap) * 100);
      return `${base}\nРасчёт: груз ${num(cargo)} mt ÷ вместимость ${num(cap)} mt = ${pct}% → ${c!.rationale}\n${caveat}`;
    }
  }
  return `${base}\n${caveat}`;
}

/** "Объём груза под трюмы" worked-calc from stored bracketData "N% of grain". */
function volumeDetail(c: FitBreakdownComponent | undefined): string {
  const base =
    'Проверяем, поместится ли груз по ОБЪЁМУ: вес × удельный погрузочный объём (stowage factor) сравниваем с зерновой вместимостью трюмов.';
  const caveat =
    'Stowage factor берётся из письма; если не указан — оценка по типу груза.';
  const m = c?.bracketData?.match(/([\d.]+)\s*%/);
  if (m) {
    return `${base}\nРасчёт: груз занимает ~${m[1]}% объёма трюмов (зерновая вместимость).\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/** "Балласт-переход" worked-calc from stored bracketData "~N nm" + vesselClass radius. */
function ballastDetail(
  c: FitBreakdownComponent | undefined,
  vesselClass: string | undefined,
): string {
  const base =
    'Балластный переход — расстояние от текущей позиции судна до порта погрузки (судно идёт без груза).';
  const caveat =
    'Бункер балластного перехода учтён в строке TCE, отдельно здесь не показан. Дистанция — lookup по таблице портов, приблизительно.';
  const m = c?.bracketData?.match(/~?\s*([\d,]+)\s*nm/i);
  const cls = vesselClass?.toLowerCase();
  const r = cls ? BALLAST_RADIUS_NM[cls] : undefined;
  if (m && r) {
    return `${base}\nРасчёт: переход ~${m[1]} nm vs радиус класса ~${num(r)} nm (${cls}) → ${c!.rationale}\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/** "TCE vs breakeven" worked-calc from stored tce / breakeven columns. */
function tceDetail(tce: number, breakeven: number | null): string {
  const base =
    'TCE (Time Charter Equivalent) — дневная доходность рейса за вычетом портовых сборов и бункера. Сравниваем с точкой безубыточности судовладельца: выше → рейс прибыльный, ниже → убыток.';
  const caveat =
    'War-risk показан в breakdown отдельной строкой — в это число он НЕ входит. ' +
    'Комиссия (адрес + брокераж, ставка из письма либо 3.75% TTL по умолчанию) ВЫЧТЕНА из фрахта — TCE здесь net-of-commission.';
  if (breakeven != null) {
    const diff = tce - breakeven;
    const sign = diff >= 0 ? '+' : '−';
    const verdict = diff >= 0 ? 'выше breakeven' : 'ниже breakeven';
    return `${base}\nРасчёт: TCE ${usd(tce)}/сут − breakeven ${usd(breakeven)}/сут = ${sign}${usd(Math.abs(diff))}/сут → ${verdict}.\n${caveat}`;
  }
  return `${base}\n${caveat}`;
}

/** "Vessel age" worked-calc from stored vessel.built + refYear. */
function ageDetail(built: number | null | undefined, refYear: number, rationale: string): string {
  const base =
    'Возраст судна: год отсчёта минус год постройки. До 15 лет — современное, 15–22 — зрелое (выше риск обслуживания), свыше 22 — повышенный риск задержаний и off-hire.';
  if (built != null) {
    return `${base}\nРасчёт: ${refYear} − ${built} = ${refYear - built} лет → ${rationale}`;
  }
  return base;
}

/** Lookup (has_calc=false) vetting detail + source, keyed by VettingFactor.key. */
const VETTING_LOOKUP: Record<string, { detail: string; source: string }> = {
  flag: {
    source: SRC.parisMou,
    detail:
      'Флаг судна сверяется со списком Paris MoU (межгосударственный меморандум по портовому контролю). Серый/чёрный список флага = повышенный риск задержаний судна в портах.',
  },
  class: {
    source: SRC.iacs,
    detail:
      'Классификационное общество судна проверяется на членство в IACS (ассоциация ведущих классов). Класс вне IACS — повышенный технический риск.',
  },
  pandi: {
    source: SRC.pandi,
    detail:
      'Страховщик ответственности (P&I) судна проверяется на членство в International Group — пуле ведущих клубов с надёжным покрытием.',
  },
  psc: {
    source: SRC.equasis,
    detail:
      'История задержаний судна портовым контролем (PSC) по базе Equasis. Свежие задержания = повышенный риск инспекций.',
  },
  cii: {
    source: SRC.equasis,
    detail:
      'Рейтинг углеродной интенсивности (CII, A–E) из Equasis. A/B/C — в норме, D — внимание, E — повышенный риск эксплуатационных ограничений.',
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
      return `Осадка в грузу ~${h.estimatedLadenDraftM}m vs лимит причала ${h.portLimitM}m`;
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
    label: 'Судно ↔ порт',
    icon: 'ship',
    checks: [
      draftRow('Осадка — порт погрузки', hf?.draft),
      draftRow('Осадка — порт выгрузки', hf?.destDraft),
      {
        label: 'Краны / грузовое оборудование',
        state: craneState,
        evidence: hf?.crane?.reason ?? componentEvidence(fbCranes),
        detail: craneActive
          ? 'Проверяем, есть ли у судна собственные краны/деррики на случай порта без береговой перегрузочной техники. Данные — из письма-циркуляра судна.'
          : null,
        source: craneActive ? SRC.letter : null,
      },
      buildLoaBerthRow(args),
      INACTIVE('Воздушный габарит', 'нет данных'),
    ],
  };
}

function buildCargoHolds(args: BuildDDArgs): DDCategory {
  const fbVolume = findComponent(args.fitBreakdown, 'volume');
  const fbCargoType = findComponent(args.fitBreakdown, 'cargoType');
  const imsbc = args.worksheet?.hardFilters?.imsbc;

  const HOLD_LABEL = 'Чистота трюмов / прошлый груз';
  // Founder-locked honesty copy when the circular never carried last cargoes (~96%).
  // The inactive row STILL explains itself — never a glued «нет данных», never fake-pass.
  const holdNoData: DDCheck = {
    label: HOLD_LABEL,
    state: 'inactive',
    evidence: 'Данных нет в исходном письме — нужно уточнить',
    detail:
      'Прошлый груз не указан в письме-циркуляре судна (типично для ~96% циркуляров). При наличии данных мы сверяем совместимость с текущим грузом по L5C-матрице (риск перекрёстного загрязнения, требования к зачистке трюмов). Здесь — требуется уточнить у судовладельца/брокера.',
    source: SRC.l5c,
  };
  const holdBase =
    'Смотрим последние грузы судна и проверяем совместимость с текущим грузом по L5C-матрице (риск перекрёстного загрязнения, требования к зачистке трюмов). Источник — поле прошлых грузов из письма судна.';

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
        holdCheck = { label: HOLD_LABEL, state: 'caution', evidence: reasons || 'несовместимый прошлый груз', detail: holdBase, source: SRC.l5c };
      } else if (r.requires_extra_clean) {
        holdCheck = { label: HOLD_LABEL, state: 'caution', evidence: `Прошлый груз: ${prev.join(', ')} — требуется доп. зачистка`, detail: holdBase, source: SRC.l5c };
      } else {
        holdCheck = { label: HOLD_LABEL, state: 'pass', evidence: `Прошлый груз: ${prev.join(', ')} — совместимо`, detail: holdBase, source: SRC.l5c };
      }
    }
  }

  const imsbcCheck: DDCheck = imsbc
    ? {
        label: 'IMSBC группа',
        state: imsbc.pass === false || imsbc.warning ? 'caution' : 'info',
        evidence: imsbc.reason ?? null,
        detail:
          'Сверяем груз с Кодексом IMSBC (морская перевозка навалочных грузов): группа A/B/C, требования к перевозке и ограничения судна.',
        source: SRC.imsbc,
      }
    : INACTIVE('IMSBC группа', 'нет данных');

  const volumeState = componentState(fbVolume);
  const cargoTypeState = componentState(fbCargoType);

  return {
    key: 'cargo-holds',
    label: 'Груз ↔ трюмы',
    icon: 'package',
    checks: [
      {
        label: 'Объём груза под трюмы',
        state: volumeState,
        evidence: componentEvidence(fbVolume),
        detail: volumeState !== 'inactive' ? volumeDetail(fbVolume) : null,
        source: volumeState !== 'inactive' ? SRC.letter : null,
      },
      {
        label: 'Тип груза ↔ тип судна',
        state: cargoTypeState,
        evidence: componentEvidence(fbCargoType),
        detail: cargoTypeState !== 'inactive'
          ? 'Сверяем тип груза с типом и конструкцией судна (балкер/твиндекер и т.п.) на принципиальную совместимость. Данные — из письма.'
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
    tceCheck = INACTIVE('TCE vs breakeven', 'нет данных');
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
      evidence: `TCE ${usd(args.tceUsdPerDay)}/day — ${usd(Math.abs(diff))}/day ${diff >= 0 ? 'выше' : 'ниже'} breakeven`,
      detail: tceDetail(args.tceUsdPerDay, args.breakevenTce),
      source: SRC.tce,
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
      detail:
        'Откуда взята ставка фрахта: вручную из письма (manual/parsed) или оценка по индексу Baltic / сиду. Оценочная ставка → число приблизительное, помечается «оценка».',
      source: SRC.freight,
    };
  }

  const fbEconState = componentState(fbEconomics);
  const fbUtilState = componentState(fbUtil);
  const fbBallastState = componentState(fbBallast);
  const vesselClass = args.fitBreakdown?.vesselClass;

  return {
    key: 'economics',
    label: 'Экономика рейса',
    icon: 'coin',
    checks: [
      tceCheck,
      {
        label: 'Экономика рейса (фит)',
        state: fbEconState,
        evidence: componentEvidence(fbEconomics),
        detail: fbEconState !== 'inactive'
          ? 'Доля экономики рейса в итоговом фит-%: насколько рейс выгоден относительно альтернатив для этого класса судна.'
          : null,
        source: fbEconState !== 'inactive' ? SRC.tce : null,
      },
      {
        label: 'Утилизация DWT',
        state: fbUtilState,
        evidence: componentEvidence(fbUtil),
        detail: fbUtilState !== 'inactive' ? utilDetail(fbUtil) : null,
        source: fbUtilState !== 'inactive' ? SRC.tce : null,
      },
      {
        label: 'Балласт-переход',
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
        checks.push({ label: f.label, state, evidence: 'нет данных по судну', detail: null, source: null });
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
      label: 'Ветинг судна (сводно)',
      state: rollState,
      evidence: componentEvidence(fbVetting),
      detail: rollState !== 'inactive'
        ? 'Сводная оценка ветинга судна (флаг, класс, возраст, P&I, PSC, CII) — детализация по судну недоступна в этом снэпшоте.'
        : null,
      source: rollState !== 'inactive' ? SRC.equasis : null,
    });
  }

  // Timing readiness — fb timing component, or readiness verdict as a fallback.
  const timingDetail =
    'Готовность судна к laycan: сопоставляем дату освобождения и переход до порта погрузки с окном laycan груза. Данные — из письма.';
  let timingCheck: DDCheck;
  if (fbTiming) {
    const ts = componentState(fbTiming);
    timingCheck = {
      label: 'Готовность / тайминг',
      state: ts,
      evidence: componentEvidence(fbTiming),
      detail: ts !== 'inactive' ? timingDetail : null,
      source: ts !== 'inactive' ? SRC.letter : null,
    };
  } else if (args.worksheet?.readiness?.verdict) {
    timingCheck = {
      label: 'Готовность / тайминг',
      state: 'info',
      evidence: `Готовность: ${args.worksheet.readiness.verdict}`,
      detail: timingDetail,
      source: SRC.letter,
    };
  } else {
    timingCheck = INACTIVE('Готовность / тайминг', 'нет данных');
  }

  const classState = componentState(fbClass);
  checks.push({
    label: 'Класс судна (фит)',
    state: classState,
    evidence: componentEvidence(fbClass),
    detail: classState !== 'inactive'
      ? 'Насколько класс судна (handysize/supramax/panamax/capesize) подходит под параметры груза и рейса — вклад в итоговый фит-%.'
      : null,
    source: classState !== 'inactive' ? SRC.fit : null,
  });
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
      detail:
        'Проверяем судно, его владельца и управляющую компанию по санкционным спискам OFAC (США) и ЕС. Красный флаг блокирует рейс. Данные — из санкционного слоя системы на момент матчинга.',
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
          ? 'Проверяем, проходит ли позиция судна или рейс через зоны военного риска по спискам JWC (Joint War Committee). Попадание в зону = надбавка war-risk и повышенный риск. Стоимость war-risk показана в breakdown TCE отдельно.'
          : null,
        source: warState !== 'inactive' ? SRC.jwc : null,
      }
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
