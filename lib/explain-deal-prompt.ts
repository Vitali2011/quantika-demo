/**
 * Shared user-prompt builder for "Explain this deal" (#589 R3).
 *
 * Extracted from route.ts so the progonq runner and the production handler
 * use identical prompt logic (principle #13: production-harness parity).
 *
 * R3 changes vs R2:
 *  - FULL DATA JSON moved behind a stronger "DO NOT EXTRACT FROM HERE" gate
 *  - Calibration example injected above FULL DATA
 *  - Temperature lowered at call site (0.3) — see route.ts
 */
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import { isRange } from '@/lib/types';

/** Format a value for the MATCH PAYLOAD anchor; returns "NOT_PROVIDED" for absent values. */
export function fmtAnchorValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'NOT_PROVIDED';
  if (typeof v === 'object' && 'value' in (v as { value?: unknown })) {
    const val = (v as { value: unknown }).value;
    return val === null || val === undefined || val === '' ? 'NOT_PROVIDED' : String(val);
  }
  return String(v);
}

export function buildExplainDealUserPrompt(
  match: Match,
  cargo: ParsedCargo | null,
  vessel: ParsedVessel | null,
  matchIndex: number,
): string {
  const fmt = fmtAnchorValue;

  const cargoWeight =
    cargo?.weightMt?.value ?? cargo?.weightMtMin ?? cargo?.weightMtMax ?? null;
  const cargoQuantity = (() => {
    if (!cargo?.quantity) return null;
    if (typeof cargo.quantity === 'number') return cargo.quantity;
    if (isRange(cargo.quantity)) {
      return `${cargo.quantity.min}–${cargo.quantity.max}`;
    }
    return null;
  })();

  // Economics fields — include breakdown when available
  const econ = match.economics;
  const econAny = econ as Record<string, unknown> | undefined;

  const payloadLines = [
    `cargo.type: ${fmt(cargo?.cargoType)}`,
    `cargo.description: ${fmt(cargo?.cargoDescription)}`,
    `cargo.weight_mt: ${cargoWeight !== null ? `${cargoWeight} MT` : 'NOT_PROVIDED'}`,
    `cargo.quantity: ${cargoQuantity !== null ? cargoQuantity : 'NOT_PROVIDED'}`,
    `cargo.stowage_factor: ${fmt(cargo?.stowageFactor)}`,
    `cargo.origin_port: ${fmt(cargo?.originPort)}`,
    `cargo.destination_port: ${fmt(cargo?.destinationPort)}`,
    `cargo.laycan: ${fmt(cargo?.laycan)}`,
    `cargo.loading_rate: ${fmt(cargo?.loadingRate)}`,
    `cargo.discharge_rate: ${fmt(cargo?.dischargeRate)}`,
    `vessel.name: ${fmt(vessel?.vesselName)}`,
    `vessel.imo: ${fmt(vessel?.imo)}`,
    `vessel.type: ${fmt(vessel?.vesselType)}`,
    `vessel.flag: ${fmt(vessel?.flag)}`,
    `vessel.built: ${fmt(vessel?.built)}`,
    `vessel.dwt_summer: ${vessel?.dwtSummer?.value ? `${vessel.dwtSummer.value} MT` : 'NOT_PROVIDED'}`,
    `vessel.dwcc: ${vessel?.dwcc?.value ? `${vessel.dwcc.value} MT` : 'NOT_PROVIDED'}`,
    `vessel.draft_max: ${vessel?.draftMax?.value ? `${vessel.draftMax.value} m` : 'NOT_PROVIDED'}`,
    `vessel.class_society: ${fmt(vessel?.classSociety)}`,
    `vessel.geared: ${vessel?.geared === null || vessel?.geared === undefined ? 'NOT_PROVIDED' : String(vessel.geared)}`,
    `vessel.crane_capacity: ${fmt(vessel?.craneCapacity)}`,
    `vessel.holds_count: ${fmt(vessel?.holdsCount)}`,
    `vessel.grain_capacity: ${vessel?.grainCapacity ? String(vessel.grainCapacity) : 'NOT_PROVIDED'}`,
    `vessel.open_position: ${fmt(vessel?.openPosition)}`,
    `vessel.open_date: ${fmt(vessel?.openDate)}`,
    `vessel.speed_laden: ${fmt(vessel?.speedLaden)}`,
    `vessel.consumption: ${fmt(vessel?.consumption)}`,
    `economics.total_usd: ${econ?.totalUsd ? `USD ${econ.totalUsd}` : 'NOT_PROVIDED'}`,
    `economics.tce: ${econAny?.tce ? `USD ${econAny.tce}` : 'NOT_PROVIDED'}`,
    `economics.market_tce: ${econAny?.marketTce ? `USD ${econAny.marketTce}` : 'NOT_PROVIDED'}`,
    `economics.bunker_cost: ${econ?.breakdown?.bunkerCost ? `USD ${econ.breakdown.bunkerCost}` : 'NOT_PROVIDED'}`,
    `economics.eu_ets: ${econ?.breakdown?.euEtsAmount ? `EUR ${econ.breakdown.euEtsAmount}` : 'NOT_PROVIDED'}`,
    `economics.war_risk: ${econ?.breakdown?.warRiskPremium ? `USD ${econ.breakdown.warRiskPremium}` : 'NOT_PROVIDED'}`,
  ].join('\n- ');

  return `MATCH PAYLOAD (index ${matchIndex}) — CANONICAL SOURCE OF TRUTH.
Use ONLY these values when writing numbers or facts. Fields marked NOT_PROVIDED have no value.

- ${payloadLines}

FORBIDDEN — do NOT mention any field marked NOT_PROVIDED. Do NOT substitute with "typical" values:
- Stowage factors in m³/MT or any unit (if cargo.stowage_factor is NOT_PROVIDED)
- Vessel class societies (DNV, LR, ABS, BV, NK, RINA, CCS, KR, etc.) unless listed above
- Gear status (gearless, geared, crane-fitted) if vessel.geared is NOT_PROVIDED
- Specific cargo quantities, DWT, DWCC, freight rates not listed above
- Open position history, last cargoes, hold/hatch dimensions not in the payload
- Any number ≥ 500 that is not in the MATCH PAYLOAD above

CALIBRATION — what "NOT_PROVIDED" means in practice:
If cargo.weight_mt is NOT_PROVIDED and vessel.dwt_summer is 58,000 MT:
  CORRECT: "MV Vessel (58,000 DWT) is positioned for this bulk inquiry. Cargo quantity was not specified — broker should confirm the stem size with the charterer."
  WRONG:   "This 50,000 MT grain parcel fits the 55,500 MT DWCC vessel." (50,000 and 55,500 are invented — not in the data.)

Score: ${match.score}/100 (${match.matchLevel.toUpperCase()})
Match Reasons: ${match.matchReasons.join('; ') || 'none'}
Issues: ${match.issues.join('; ') || 'none'}

─── SUPPLEMENTARY CONTEXT ONLY ───────────────────────────────────────────────
DO NOT extract any value from below if that field is NOT_PROVIDED in the MATCH
PAYLOAD anchor above. The anchor is canonical; the JSON below is read-only context.
─────────────────────────────────────────────────────────────────────────────

CARGO:
${cargo ? JSON.stringify(cargo, null, 2) : 'Not available'}

VESSEL:
${vessel ? JSON.stringify(vessel, null, 2) : 'Not available'}

ECONOMICS:
${econ ? JSON.stringify(econ, null, 2) : 'Not available'}

SCORE BREAKDOWN:
${match.scoreBreakdown ? JSON.stringify(match.scoreBreakdown, null, 2) : 'Not available'}

Please produce the 4-section narrative using ONLY values from the MATCH PAYLOAD anchor above.`;
}
