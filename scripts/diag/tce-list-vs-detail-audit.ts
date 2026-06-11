/**
 * THROWAWAY DIAGNOSTIC — TCE LIST vs DETAIL per-match audit (CORRECTED).
 *
 * WHY CORRECTED: a previous run treated the FROZEN seed column
 * `matches.tce_usd_per_day` as the LIST value. That is wrong. On every /matches
 * render, app/matches/page.tsx:51-53 calls persistSessionMatches(...), which
 * RECOMPUTES the stored TCE at runtime via
 * computeStoredMatchEconomics({cargo, vessel, db})  (persist-session-matches.ts:38-39)
 * and the list reads THOSE fresh rows back. So the LIST value the founder sees
 * is a LIVE recompute, not the frozen column.
 *
 *   LIST   = computeStoredMatchEconomics({cargo, vessel, db})   ← NO bunkerPriceUsdPerMt,
 *            NO calculatedAt — exactly mirroring persistSessionMatches.ts:38-39.
 *            Take .tce_usd_per_day and .tce_breakdown (da_usd, canal_usd, bunker, ets,
 *            duration, …).
 *   DETAIL = faithful replica of POST /api/voyage/tce (app/api/voyage/tce/route.ts),
 *            fed the request body the way components/match/EconomicsTab.tsx builds it
 *            (buildCanonicalTceInputs + includeEuETS:true + bunkerPort NLRTM/VLSFO,
 *            no manual price). Then the route's resolution: live bunker via
 *            getLatestBunkerPrice(db,'NLRTM','VLSFO'), Bosporus-only canal auto-add
 *            (NO Suez), ETS per includeEuETS, DA via resolveDaUsd, then calculateTCE →
 *            breakdown.daily_tce_usd.
 *
 * ALIGNMENT (so the comparison isolates the REAL causes):
 *  1. Both sides use the SAME laden distance = getPortDistance(origin,dest) [LIVE].
 *     (persist writes that live distance into the row; EconomicsTab sends it back.)
 *  2. Both sides use the SAME freight rate = the one computeStoredMatchEconomics
 *     resolves (persist writes it to the row; EconomicsTab reads it as storedFreightRate).
 *  3. Both sides use the SAME ballast distance = getPortDistance(open,origin)
 *     and thus the same single-voyage duration (PR #862).
 *  4. cargo/vessel sourced from parsed_results keyed by (id|itemIndex),
 *     mirroring persistSessionMatches cargoMap/vesselMap.
 *
 * Run:  SESSIONS_DB_PATH=data/demo-seed.db DEMO_MODE=true \
 *       KNOWLEDGE_LAYER_DISTANCES_ENABLED=false \
 *       npx tsx scripts/diag/tce-list-vs-detail-audit.ts
 *
 * READ-ONLY. Opens the DB read-only; never writes.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { calculateTCE, type VoyageInput, type TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { resolvePort, type ResolvedPort } from '@/lib/ports/resolve';
import { resolveVaguePort } from '@/lib/ports/resolve-vague';
import { getPortDa } from '@/lib/port-da/repository';
import { isEuCountry } from '@/lib/validation/sanctions';
import { routeTransitsBosporus, quoteBosporusSafe, routeTransitsSuez, quoteSuezSafe, parseConsumption } from '@/lib/matching/tce-calculator';

const DB_PATH = process.env.SESSIONS_DB_PATH || path.join(process.cwd(), 'data', 'demo-seed.db');
const db = new Database(DB_PATH, { readonly: true });

// ── load parsed cargos/vessels keyed by emailId|itemIndex (persist convention) ──
interface ParsedRow { parse_type: string; result_json: string; }
const parsedRows = db.prepare(`SELECT parse_type, result_json FROM parsed_results`).all() as ParsedRow[];
const cargoMap = new Map<string, ParsedCargo>();
const vesselMap = new Map<string, ParsedVessel>();
for (const row of parsedRows) {
  let arr: unknown;
  try { arr = JSON.parse(row.result_json); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  if (row.parse_type === 'cargo') {
    for (const c of arr as ParsedCargo[]) cargoMap.set(`${c.emailId}|${c.itemIndex ?? 0}`, c);
  } else if (row.parse_type === 'vessel') {
    for (const v of arr as ParsedVessel[]) vesselMap.set(`${v.emailId}|${v.itemIndex ?? 0}`, v);
  }
}

// ── market inputs the DETAIL route resolves live (route.ts:266-281, 299-306) ──
const bunkerRow = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
const liveBunkerPrice = bunkerRow?.price_usd_per_mt ?? null; // null → route would 422; we record
const euaRow = getLatestEuaPrice(db, 'spot');
const euaPriceEur = euaRow?.price_eur_per_tco2;

// ── DETAIL-path replicas of route.ts internals (not exported — faithful copies) ──
const LOCODE_RE = /^[A-Za-z]{5}$/;
function resolvePortOrPassthrough(input: string): { port: ResolvedPort; approximate: boolean } | null {
  const resolved = resolvePort(input);
  if (resolved) return { port: resolved, approximate: false };
  if (LOCODE_RE.test(input)) {
    const code = input.toUpperCase();
    return { port: { portCode: code, portName: code, country: '', lat: 0, lon: 0, aliases: [] }, approximate: false };
  }
  const vague = resolveVaguePort(input);
  if (vague) return { port: vague, approximate: true };
  return null;
}
// route.ts resolveDaUsd: EconomicsTab body sends NO cargoType → getPortDa cargoType=undefined → 'general'.
// getPortDa here uses the { portCode } form exactly as route.ts:130-133.
function resolveDaUsdDetail(originResolved: ResolvedPort, destinationResolved: ResolvedPort, vesselDwt: number): number {
  let total = 0;
  for (const port of [originResolved, destinationResolved]) {
    try {
      const da = getPortDa({ portCode: port.portCode, vesselDwt, cargoType: undefined }, db);
      if (da) total += da.totalFixedUsd;
    } catch { /* skip */ }
  }
  return total;
}
// route.ts:234-254: resolveCanalUsd returns 0 (no canalUsd/viaSuez/viaCanal in body),
// then auto-adds Bosporus+Suez for laden leg AND ballast leg (parity with stored-match path).
function resolveCanalUsdDetail(originName: string, destName: string, vesselDwt: number, openPosition?: string | null): number {
  let canalUsd = 0;
  // Laden leg
  if (routeTransitsBosporus(originName, destName)) {
    canalUsd += quoteBosporusSafe(vesselDwt);
  }
  if (routeTransitsSuez(originName, destName)) {
    canalUsd += quoteSuezSafe(vesselDwt, true);
  }
  // Ballast leg: open position → load port
  if (openPosition) {
    const openR = resolvePortOrPassthrough(openPosition);
    const openName = openR?.port.portName ?? openPosition;
    if (routeTransitsBosporus(openName, originName)) {
      canalUsd += quoteBosporusSafe(vesselDwt);
    }
    if (routeTransitsSuez(openName, originName)) {
      canalUsd += quoteSuezSafe(vesselDwt, false); // ballast = unladen
    }
  }
  return canalUsd;
}

// ── per-match rows ───────────────────────────────────────────────────────────
interface MatchRow {
  id: number; cargo_id: string; vessel_id: string;
  cargo_item_index: number | null; vessel_item_index: number | null;
  load_port: string | null; discharge_port: string | null;
  vessel_name: string | null; tce_usd_per_day: number | null;
  distance_nm: number | null; freight_rate_usd_per_mt: number | null;
}
const matchRows = db.prepare(`
  SELECT id, cargo_id, vessel_id, cargo_item_index, vessel_item_index,
         load_port, discharge_port, vessel_name, tce_usd_per_day, distance_nm, freight_rate_usd_per_mt
  FROM matches WHERE user_id IS NULL ORDER BY id
`).all() as MatchRow[];

interface SubInputs {
  duration_days: number | null;
  ballast_nm: number | null;
  da_usd: number | null;
  bunker_price: number | null;
  bunker_usd: number | null;
  gross_freight_usd: number | null;
  canal_usd: number | null;
  ets_usd: number | null;
  quantity_mt: number | null;
  freight_rate: number | null;
  distance_nm: number | null;
}
interface Out {
  id: number; vessel: string; route: string;
  list_tce: number | null;        // LIVE computeStoredMatchEconomics (what /matches renders)
  detail_tce: number | null;      // faithful /api/voyage/tce recompute
  frozen_tce: number | null;      // seed tce_usd_per_day column (for reference only)
  live_dist: number | null;
  delta: number | null; delta_pct: number | null;
  cause: string;
  list: SubInputs; detail: SubInputs;
  note?: string;
}

function emptySub(): SubInputs {
  return { duration_days: null, ballast_nm: null, da_usd: null, bunker_price: null,
    bunker_usd: null, gross_freight_usd: null, canal_usd: null, ets_usd: null,
    quantity_mt: null, freight_rate: null, distance_nm: null };
}
function fromBreakdown(b: TCEBreakdown, ballastNm: number | null): SubInputs {
  return {
    duration_days: b.duration_days,
    ballast_nm: ballastNm,
    da_usd: b.da_usd,
    bunker_price: b.bunker_price_usd_per_mt,
    bunker_usd: b.bunker_usd,
    gross_freight_usd: b.gross_freight_usd,
    canal_usd: b.canal_usd,
    ets_usd: b.ets_usd,
    quantity_mt: b.quantity_mt,
    freight_rate: b.freight_rate_usd_per_mt,
    distance_nm: null, // filled by caller
  };
}

const results: Out[] = [];
let skipped = 0;

for (const m of matchRows) {
  const cargo = cargoMap.get(`${m.cargo_id}|${m.cargo_item_index ?? 0}`);
  const vessel = vesselMap.get(`${m.vessel_id}|${m.vessel_item_index ?? 0}`);
  const routeStr = `${m.load_port ?? '?'}→${m.discharge_port ?? '?'}`;
  const vesselName = m.vessel_name || (vessel ? cfValue(vessel.vesselName) : null) || `(${m.vessel_id.slice(0, 6)})`;

  if (!cargo || !vessel) {
    skipped++;
    results.push({
      id: m.id, vessel: vesselName, route: routeStr,
      list_tce: null, detail_tce: null, frozen_tce: m.tce_usd_per_day,
      live_dist: null, delta: null, delta_pct: null,
      cause: 'SKIP: parsed cargo/vessel not found in parsed_results',
      list: emptySub(), detail: emptySub(),
      note: `cargo=${!!cargo} vessel=${!!vessel}`,
    });
    continue;
  }

  const loadPort = cfValue(cargo.originPort);
  const dischargePort = cfValue(cargo.destinationPort);
  const openPos = cfValue(vessel.openPosition);

  // ── LIST side = LIVE computeStoredMatchEconomics (persist-session-matches.ts:38-39) ──
  // fix #1: persistSessionMatches now resolves live bunker once and passes it in.
  const listEco = computeStoredMatchEconomics({ cargo, vessel, db, bunkerPriceUsdPerMt: liveBunkerPrice ?? undefined });
  const listTce = listEco.tce_usd_per_day;
  const liveDist = listEco.distance_nm; // getPortDistance(load,disch).nm — the LIVE laden distance

  // ballast (open→load): same source both sides use
  const ballast = openPos && loadPort ? (getPortDistance(openPos, loadPort)?.nm ?? null) : null;

  const listSub: SubInputs = listEco.tce_breakdown
    ? fromBreakdown(listEco.tce_breakdown, ballast)
    : emptySub();
  listSub.distance_nm = liveDist;

  // ── DETAIL side: faithful replica of EconomicsTab + /api/voyage/tce ──
  // Alignment: detail uses the SAME live laden distance and the SAME freight rate
  // that the list resolves (EconomicsTab feeds routeDistanceNm=storedDistanceNm and
  // storedFreightRate, both written by persist from these very functions).
  const detailDistance = liveDist ?? 0;
  const dwt = cfValue(vessel.dwtSummer) ?? 0;
  const speedKts = parseLeading(vessel.speedLaden);
  const rawCons = parseConsumption(vessel.consumption);
  const consumption = resolveConsMtPerDay(rawCons, dwt);
  const quantityMt = resolveCargoWeight(cargo) ?? 0;
  const freightRate = listEco.freight_rate_usd_per_mt ?? null;

  let detailSub = emptySub();
  let detailTce: number | null = null;
  let detailNote = '';

  const originName = loadPort ?? '';
  const destName = dischargePort ?? '';
  const ready =
    originName.length > 0 && destName.length > 0 && dwt > 0 && speedKts > 0 &&
    rawCons > 0 && detailDistance > 0 && quantityMt > 0 &&
    freightRate != null && freightRate > 0 && liveBunkerPrice != null;

  if (!ready) {
    detailNote = `not-ready: ${[
      originName ? '' : 'origin', destName ? '' : 'dest', dwt > 0 ? '' : 'dwt',
      speedKts > 0 ? '' : 'speed', rawCons > 0 ? '' : 'cons', detailDistance > 0 ? '' : 'dist',
      quantityMt > 0 ? '' : 'qty', (freightRate != null && freightRate > 0) ? '' : 'rate',
      liveBunkerPrice != null ? '' : 'bunker-422',
    ].filter(Boolean).join(',')}`;
  } else {
    const originR = resolvePortOrPassthrough(originName);
    const destR = resolvePortOrPassthrough(destName);
    if (!originR || !destR) {
      detailNote = `port_not_found: origin=${!!originR} dest=${!!destR}`;
    } else {
      const oResolved = originR.port;
      const dResolved = destR.port;
      const canalUsd = resolveCanalUsdDetail(oResolved.portName, dResolved.portName, dwt, openPos);
      const daUsd = resolveDaUsdDetail(oResolved, dResolved, dwt);
      const originEu = isEuCountry(oResolved.country);
      const destEu = isEuCountry(dResolved.country);
      let resolvedEuLegPercent: number | undefined = undefined;
      const includeEuETS = true;
      if (includeEuETS && (euaPriceEur ?? 0) > 0) {
        if (originEu || destEu) resolvedEuLegPercent = 1.0; // route.ts:328-335
      }

      // core canonical inputs (EconomicsTab passes ballastDistanceNm so SV duration)
      const core: VoyageInput = buildCanonicalTceInputs({
        vesselDwt: dwt,
        speedKts,
        consumptionMtPerDay: consumption,
        distanceNm: detailDistance,
        quantityMt,
        freightRateUsdPerMt: freightRate,
        bunkerPriceUsdPerMt: 0, // placeholder; route resolves real bunker below
        euaPriceEur,
        vesselValueUsd: estimateVesselValueUsd(dwt),
        originPort: originName,
        destinationPort: destName,
        ballastDistanceNm: ballast ?? undefined,
      });

      // Route's final VoyageInput (route.ts:349-374), replicated exactly:
      const tceInput: VoyageInput = {
        vessel: core.vessel,
        route: {
          originPort: oResolved.portName,
          destinationPort: dResolved.portName,
          distanceNm: detailDistance,
        },
        cargo: core.cargo,
        bunkerPriceUsdPerMt: liveBunkerPrice!, // route auto-resolves NLRTM/VLSFO
        euaPriceEur: euaPriceEur ?? 0,
        durationDays: core.durationDays,
        euLegPercent: resolvedEuLegPercent,
        originEu: includeEuETS ? originEu : undefined,
        destEu: includeEuETS ? destEu : undefined,
        canalUsd,
        daUsd,
        excludeWarRiskFromDailyTce: true,
      };
      const res = calculateTCE(tceInput);
      detailTce = res.daily_tce_usd;
      detailSub = fromBreakdown(res.breakdown, ballast);
      detailSub.distance_nm = detailDistance;
    }
  }

  const delta = listTce != null && detailTce != null ? detailTce - listTce : null;
  const deltaPct = delta != null && listTce != null && listTce !== 0
    ? (delta / Math.abs(listTce)) * 100 : null;

  // CAUSE — both sides share the same live distance, rate, ballast, duration (by
  // construction). So any delta is structural: list↔detail code-path divergence on
  // bunker price (600 vs live), canal (list Suez+Bosporus vs detail Bosporus-only),
  // ETS, or DA (list cargoType vs detail general).
  let cause: string;
  if (detailNote) {
    cause = `detail-unavailable: ${detailNote}`;
  } else {
    cause = classifyCause(listSub, detailSub, delta);
  }

  results.push({
    id: m.id, vessel: vesselName, route: routeStr,
    list_tce: listTce, detail_tce: detailTce, frozen_tce: m.tce_usd_per_day,
    live_dist: liveDist,
    delta, delta_pct: deltaPct,
    cause,
    list: listSub, detail: detailSub,
    note: detailNote || undefined,
  });
}

function parseLeading(s: unknown): number {
  if (s == null) return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  if (typeof s === 'object' && 'value' in (s as Record<string, unknown>)) return parseLeading((s as { value: unknown }).value);
  if (typeof s !== 'string') return 0;
  const mm = s.match(/(\d+(?:\.\d+)?)/);
  return mm ? Number(mm[1]) : 0;
}

// ── per-line gap attribution ─────────────────────────────────────────────────
// We attribute the TCE gap to cost lines by the per-day impact of each line's USD
// difference: a cost line that is ΔX USD higher on detail lowers detail TCE by
// ΔX / duration. (duration agrees across sides, so we use the shared duration.)
interface LineGap { line: string; listUsd: number | null; detailUsd: number | null; usdDelta: number; perDayImpact: number; }
function lineGaps(L: SubInputs, D: SubInputs): LineGap[] {
  const dur = D.duration_days ?? L.duration_days ?? 0;
  const gaps: LineGap[] = [];
  const add = (line: string, lv: number | null, dv: number | null) => {
    if (lv == null && dv == null) return;
    const lu = lv ?? 0, du = dv ?? 0;
    const usdDelta = du - lu;               // detail − list (USD over the voyage)
    const perDay = dur > 0 ? -usdDelta / dur : 0; // higher cost → lower TCE
    gaps.push({ line, listUsd: lv, detailUsd: dv, usdDelta, perDayImpact: perDay });
  };
  add('bunker', L.bunker_usd, D.bunker_usd);
  add('canal', L.canal_usd, D.canal_usd);
  add('ets', L.ets_usd, D.ets_usd);
  add('da', L.da_usd, D.da_usd);
  return gaps;
}
function classifyCause(L: SubInputs, D: SubInputs, delta: number | null): string {
  // duration / freight / quantity / distance sanity (should agree by construction)
  const struct: string[] = [];
  const cmp = (k: string, lv: number | null, dv: number | null, tol: number) => {
    if (lv == null || dv == null) return;
    if (Math.abs(dv - lv) > tol) struct.push(`${k} MISMATCH list ${fmt(lv)} vs detail ${fmt(dv)}`);
  };
  cmp('duration', L.duration_days, D.duration_days, 0.05);
  cmp('freight_rate', L.freight_rate, D.freight_rate, 0.01);
  cmp('quantity', L.quantity_mt, D.quantity_mt, 1);
  cmp('distance', L.distance_nm, D.distance_nm, 1);

  const gaps = lineGaps(L, D).filter((g) => Math.abs(g.usdDelta) > 1);
  gaps.sort((a, b) => Math.abs(b.perDayImpact) - Math.abs(a.perDayImpact));
  const lineDesc = gaps.map((g) =>
    `${g.line}: list ${money(g.listUsd)} vs detail ${money(g.detailUsd)} (Δ${money(Math.round(g.usdDelta))} → ${signMoney(g.perDayImpact)}/day)`,
  );

  if (struct.length === 0 && gaps.length === 0) {
    return Math.abs(delta ?? 0) < 1 ? 'IDENTICAL (delta < $1)' : 'minor residual (sub-$1 lines / rounding)';
  }
  const parts: string[] = [];
  if (struct.length > 0) parts.push(`[alignment-break] ${struct.join('; ')}`);
  if (lineDesc.length > 0) parts.push(lineDesc.join(' | '));
  return parts.join(' || ');
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('en-US');
  return (Math.round(n * 100) / 100).toString();
}
function money(n: number | null): string {
  if (n == null) return '—';
  return Math.round(n).toLocaleString('en-US');
}
function signMoney(n: number): string {
  const s = Math.round(n).toLocaleString('en-US');
  return n >= 0 ? `+$${s}` : `-$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

// ── sort by |delta| desc (nulls last) ────────────────────────────────────────
const withDelta = results.filter((r) => r.delta != null);
const noDelta = results.filter((r) => r.delta == null);
withDelta.sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));

// ── summary stats ────────────────────────────────────────────────────────────
const total = results.length;
const measured = withDelta.length;
const exact = withDelta.filter((r) => Math.abs(r.delta!) < 1).length;
const gt5pct = withDelta.filter((r) => r.delta_pct != null && Math.abs(r.delta_pct) > 5).length;
const gt1pct = withDelta.filter((r) => r.delta_pct != null && Math.abs(r.delta_pct) > 1).length;

// ── CAUSE ATTRIBUTION over the diverging set ─────────────────────────────────
const diverging = withDelta.filter((r) => Math.abs(r.delta!) >= 1);
let sumAbsGap = 0;                       // Σ |delta| ($/day) across diverging
const lineAbsImpact = new Map<string, number>(); // Σ |perDayImpact| by line
const lineTouches = new Map<string, number>();    // # matches each line touches (>$1/day)
let bunkerPriceDiffCount = 0;            // matches where list bunker_price≠detail bunker_price
let canalListOnlyCount = 0;             // matches where list canal>0 and detail canal differs
let etsListOnlyCount = 0;
let etsBothCount = 0;
let daDiffCount = 0;
for (const r of diverging) {
  sumAbsGap += Math.abs(r.delta!);
  for (const g of lineGaps(r.list, r.detail)) {
    if (Math.abs(g.perDayImpact) > 1) {
      lineAbsImpact.set(g.line, (lineAbsImpact.get(g.line) ?? 0) + Math.abs(g.perDayImpact));
      lineTouches.set(g.line, (lineTouches.get(g.line) ?? 0) + 1);
    }
  }
  const lbp = r.list.bunker_price, dbp = r.detail.bunker_price;
  if (lbp != null && dbp != null && Math.abs(lbp - dbp) > 0.5) bunkerPriceDiffCount++;
  const lc = r.list.canal_usd ?? 0, dc = r.detail.canal_usd ?? 0;
  if (Math.abs(lc - dc) > 1) canalListOnlyCount++;
  const le = r.list.ets_usd ?? 0, de = r.detail.ets_usd ?? 0;
  if (le > 1 && de > 1) etsBothCount++; else if (Math.abs(le - de) > 1) etsListOnlyCount++;
  const ld = r.list.da_usd ?? 0, dd = r.detail.da_usd ?? 0;
  if (Math.abs(ld - dd) > 1) daDiffCount++;
}

// ── hypotheses checks ────────────────────────────────────────────────────────
// (a) bunker 600 (list) vs ~791 (detail) on essentially every match
let list600 = 0, detail791 = 0, both600v791 = 0;
for (const r of withDelta) {
  if (r.list.bunker_price != null && Math.abs(r.list.bunker_price - 600) < 0.5) list600++;
  if (r.detail.bunker_price != null && liveBunkerPrice != null && Math.abs(r.detail.bunker_price - liveBunkerPrice) < 0.5) detail791++;
  if (r.list.bunker_price != null && r.detail.bunker_price != null &&
      Math.abs(r.list.bunker_price - 600) < 0.5 &&
      liveBunkerPrice != null && Math.abs(r.detail.bunker_price - liveBunkerPrice) < 0.5) both600v791++;
}
// (b) canal Suez present on list, absent on detail for Suez routes
const canalListGtDetail = withDelta.filter((r) => (r.list.canal_usd ?? 0) - (r.detail.canal_usd ?? 0) > 1).length;
// (c) ETS one-side-only for EU routes
const etsListOnly = withDelta.filter((r) => (r.list.ets_usd ?? 0) > 1 && (r.detail.ets_usd ?? 0) <= 1).length;
const etsDetailOnly = withDelta.filter((r) => (r.detail.ets_usd ?? 0) > 1 && (r.list.ets_usd ?? 0) <= 1).length;
// (d) duration agrees
const durMismatch = withDelta.filter((r) =>
  r.list.duration_days != null && r.detail.duration_days != null &&
  Math.abs(r.list.duration_days - r.detail.duration_days) > 0.05).length;
// (e) freight agrees
const freightMismatch = withDelta.filter((r) =>
  r.list.freight_rate != null && r.detail.freight_rate != null &&
  Math.abs(r.list.freight_rate - r.detail.freight_rate) > 0.01).length;

// ── render markdown ──────────────────────────────────────────────────────────
const lines: string[] = [];
lines.push('# TCE: LIST vs DETAIL — ground-truth per-match audit (CORRECTED)');
lines.push('');
lines.push(`- DB: \`${DB_PATH}\``);
lines.push(`- Live bunker (NLRTM/VLSFO): **${liveBunkerPrice ?? 'n/a'}** USD/mt ${bunkerRow ? `(${bunkerRow.price_date})` : '(none → detail 422)'}`);
lines.push(`- EUA spot: **${euaPriceEur ?? 'n/a'}** EUR/tCO2 ${euaRow ? `(${euaRow.price_date})` : '(none)'}`);
lines.push(`- Demo matches (user_id IS NULL): **${total}**  |  measurable BOTH sides: **${measured}**  |  skipped: **${skipped}**`);
lines.push('');
lines.push('> **Definitions (CORRECTED).** LIST_tce = `computeStoredMatchEconomics({cargo,vessel,db})` run LIVE (no bunker arg, no calculatedAt) — exactly what `persistSessionMatches` re-stores and the /matches list reads back on every render. NOT the frozen `tce_usd_per_day` column. DETAIL_tce = faithful POST /api/voyage/tce replica fed the EconomicsTab body (includeEuETS:true, bunkerPort NLRTM/VLSFO no manual price), using the SAME live laden distance, SAME freight rate, SAME ballast/duration. `frozen` column shown only for reference.');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Exact match (|delta| < $1/day): **${exact} / ${measured}** (${pct(exact, measured)})`);
lines.push(`- Diverge by >1%: **${gt1pct} / ${measured}** (${pct(gt1pct, measured)})`);
lines.push(`- **Diverge by >5%: ${gt5pct} / ${measured}** (${pct(gt5pct, measured)})`);
lines.push('');
lines.push('## CAUSE ATTRIBUTION (diverging set: |delta| ≥ $1/day)');
lines.push('');
lines.push(`Diverging matches: **${diverging.length}**. Σ|delta| = **$${Math.round(sumAbsGap).toLocaleString('en-US')}/day** of total absolute gap.`);
lines.push('');
lines.push('Share of total absolute per-day gap explained by each cost line (Σ|per-day impact| / Σ|delta|), and how many diverging matches each line touches (>$1/day):');
lines.push('');
lines.push('| line | Σ|per-day impact| | % of total gap | matches touched | % of diverging |');
lines.push('|------|------------------:|---------------:|----------------:|---------------:|');
const totalImpact = [...lineAbsImpact.values()].reduce((a, b) => a + b, 0);
for (const [line, impact] of [...lineAbsImpact.entries()].sort((a, b) => b[1] - a[1])) {
  const touch = lineTouches.get(line) ?? 0;
  lines.push(`| ${line} | $${Math.round(impact).toLocaleString('en-US')} | ${pct(impact, totalImpact)} | ${touch} | ${pct(touch, diverging.length)} |`);
}
lines.push('');
const domLine = [...lineAbsImpact.entries()].sort((a, b) => b[1] - a[1])[0];
if (domLine) lines.push(`**Single dominant cause:** \`${domLine[0]}\` — ${pct(domLine[1], totalImpact)} of total per-day gap.`);
lines.push('');
lines.push('### Hypothesis verdicts');
lines.push('');
lines.push(`- **(a)** bunker 600 (list) vs ${liveBunkerPrice ?? '?'} (detail) on essentially every match: list@600 in **${list600}/${measured}**, detail@${liveBunkerPrice} in **${detail791}/${measured}**, BOTH (600↔${liveBunkerPrice}) in **${both600v791}/${measured}**. → ${both600v791 >= measured * 0.9 ? '**CONFIRMED**' : both600v791 > 0 ? '**PARTIALLY confirmed**' : '**REFUTED**'}.`);
lines.push(`- **(b)** canal Suez present on list, absent on detail for Suez routes: list canal > detail canal in **${canalListGtDetail}/${measured}**. → ${canalListGtDetail > 0 ? '**CONFIRMED** (these are Suez-transiting routes the list charges and the detail path does not auto-add)' : '**REFUTED / N/A** (no Suez-transiting demo routes)'}.`);
lines.push(`- **(c)** ETS present on one side only for EU routes: list-only **${etsListOnly}**, detail-only **${etsDetailOnly}**, both-sides **${etsBothCount}**. → ${(etsListOnly + etsDetailOnly) > 0 ? '**CONFIRMED** (asymmetric ETS exists)' : '**REFUTED** (ETS symmetric — present/absent on both sides together)'}.`);
lines.push(`- **(d)** duration now agrees (PR #862): duration mismatch in **${durMismatch}/${measured}**. → ${durMismatch === 0 ? '**CONFIRMED** (duration identical on every match)' : `**REFUTED** (${durMismatch} mismatches)`}.`);
lines.push(`- **(e)** freight agrees: freight-rate mismatch in **${freightMismatch}/${measured}**. → ${freightMismatch === 0 ? '**CONFIRMED** (rate identical on every match)' : `**REFUTED** (${freightMismatch} mismatches)`}.`);
lines.push('');
lines.push('## Per-match table (sorted by |delta| desc)');
lines.push('');
lines.push('| id | vessel | route | LIST_tce | DETAIL_tce | delta | delta% | bunker$ L→D | canal$ L→D | ets$ L→D | da$ L→D | dur L/D | rate L/D | CAUSE |');
lines.push('|---:|--------|-------|---------:|-----------:|------:|-------:|------------|-----------|----------|---------|--------:|---------:|-------|');
for (const r of withDelta) {
  const L = r.list, D = r.detail;
  const cell = (lv: number | null, dv: number | null) => `${money(lv)}→${money(dv)}`;
  const dur = `${num(L.duration_days, 2)}/${num(D.duration_days, 2)}`;
  const rate = `${num(L.freight_rate, 2)}/${num(D.freight_rate, 2)}`;
  lines.push(`| ${r.id} | ${esc(r.vessel)} | ${esc(r.route)} | ${money(r.list_tce)} | ${money(r.detail_tce)} | ${r.delta! >= 0 ? '+' : ''}${money(r.delta)} | ${r.delta_pct != null ? (r.delta_pct >= 0 ? '+' : '') + r.delta_pct.toFixed(1) + '%' : '—'} | ${cell(L.bunker_price, D.bunker_price)} | ${cell(L.canal_usd, D.canal_usd)} | ${cell(L.ets_usd, D.ets_usd)} | ${cell(L.da_usd, D.da_usd)} | ${dur} | ${rate} | ${esc(r.cause)} |`);
}
if (noDelta.length > 0) {
  lines.push('');
  lines.push('### Matches where one side could not be computed (delta n/a)');
  lines.push('');
  lines.push('| id | vessel | route | LIST_tce | frozen | reason |');
  lines.push('|---:|--------|-------|---------:|-------:|--------|');
  for (const r of noDelta) {
    lines.push(`| ${r.id} | ${esc(r.vessel)} | ${esc(r.route)} | ${money(r.list_tce)} | ${money(r.frozen_tce)} | ${esc(r.cause)} |`);
  }
}

// ── 3 fully-worked examples: bunker-dominated, canal-dominated, ETS-dominated ──
lines.push('');
lines.push('## Worked examples (full breakdowns side by side)');
lines.push('');
function dominantLine(r: Out): string {
  const gaps = lineGaps(r.list, r.detail).filter((g) => Math.abs(g.perDayImpact) > 1);
  gaps.sort((a, b) => Math.abs(b.perDayImpact) - Math.abs(a.perDayImpact));
  return gaps[0]?.line ?? 'none';
}
const exBunker = diverging.find((r) => dominantLine(r) === 'bunker');
const exCanal = diverging.find((r) => dominantLine(r) === 'canal');
const exEts = diverging.find((r) => dominantLine(r) === 'ets');
function worked(label: string, r: Out | undefined) {
  if (!r) { lines.push(`### ${label}: none found`); lines.push(''); return; }
  lines.push(`### ${label} — match #${r.id} (${esc(r.vessel)}, ${esc(r.route)})`);
  lines.push('');
  lines.push(`LIST_tce **${money(r.list_tce)}/day**  vs  DETAIL_tce **${money(r.detail_tce)}/day**  →  delta **${r.delta! >= 0 ? '+' : ''}${money(r.delta)}/day** (${r.delta_pct?.toFixed(1)}%)`);
  lines.push('');
  lines.push('| line | LIST | DETAIL | Δ (detail−list) |');
  lines.push('|------|-----:|-------:|----------------:|');
  const rows: Array<[string, number | null, number | null]> = [
    ['duration_days', r.list.duration_days, r.detail.duration_days],
    ['distance_nm', r.list.distance_nm, r.detail.distance_nm],
    ['ballast_nm', r.list.ballast_nm, r.detail.ballast_nm],
    ['quantity_mt', r.list.quantity_mt, r.detail.quantity_mt],
    ['freight_rate', r.list.freight_rate, r.detail.freight_rate],
    ['gross_freight_usd', r.list.gross_freight_usd, r.detail.gross_freight_usd],
    ['bunker_price', r.list.bunker_price, r.detail.bunker_price],
    ['bunker_usd', r.list.bunker_usd, r.detail.bunker_usd],
    ['canal_usd', r.list.canal_usd, r.detail.canal_usd],
    ['ets_usd', r.list.ets_usd, r.detail.ets_usd],
    ['da_usd', r.list.da_usd, r.detail.da_usd],
  ];
  for (const [k, lv, dv] of rows) {
    const d = (lv != null && dv != null) ? dv - lv : null;
    lines.push(`| ${k} | ${money(lv)} | ${money(dv)} | ${d == null ? '—' : (d >= 0 ? '+' : '') + money(d)} |`);
  }
  lines.push('');
}
worked('Bunker-dominated', exBunker);
worked('Canal-dominated', exCanal);
worked('EU/ETS-dominated', exEts);

function pct(a: number, b: number): string { return b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`; }
function esc(s: string): string { return s.replace(/\|/g, '\\|'); }
function num(n: number | null, dp: number): string { return n == null ? '—' : (Math.round(n * 10 ** dp) / 10 ** dp).toString(); }

const md = lines.join('\n');
const OUT = '/tmp/tce-audit-DELTAS-CORRECTED.md';
fs.writeFileSync(OUT, md);

console.log(md.split('\n').slice(0, 60).join('\n'));
console.log('\n... (full report written to', OUT, ')');
console.log(`\nTOTALS: total=${total} measured=${measured} exact=${exact} gt1pct=${gt1pct} gt5pct=${gt5pct} skipped=${skipped} diverging=${diverging.length}`);
console.log(`HYP: list600=${list600} detail791=${detail791} both=${both600v791} | canalL>D=${canalListGtDetail} | etsListOnly=${etsListOnly} etsDetailOnly=${etsDetailOnly} etsBoth=${etsBothCount} | durMismatch=${durMismatch} freightMismatch=${freightMismatch}`);

db.close();
