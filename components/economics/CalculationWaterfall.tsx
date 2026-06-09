/**
 * CalculationWaterfall — "Show calculation" expandable transparent-math panel.
 *
 * Pure presentational component. Renders the approved waterfall layout:
 *   REVENUE PER VOYAGE → MINUS COSTS → NET VOYAGE → ÷ days → DAILY TCE
 *
 * Uses the same fmtUsd broker convention as VoyageBreakdownChart: -$X not $-X.
 * English labels — founder-facing UI.
 */

import * as React from 'react';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { DataQualityBadge } from '@/components/data-quality/DataQualityBadge';
import { deriveTier } from '@/lib/data-quality/derive';

interface Props {
  breakdown: TCEBreakdown;
}

/** Broker convention: negatives render as `-$X`, not `$-X` (matches VoyageBreakdownChart). */
function fmtUsd(n: number): string {
  if (n === 0) return '$0'; // guards both 0 and -0
  return n < 0
    ? `-$${Math.abs(n).toLocaleString('en-US')}`
    : `$${n.toLocaleString('en-US')}`;
}

export function CalculationWaterfall({ breakdown }: Props) {
  const {
    freight_rate_usd_per_mt,
    quantity_mt,
    duration_days,
    bunker_consumption_mt_per_day,
    bunker_price_usd_per_mt,
    gross_freight_usd,
    bunker_usd,
    canal_usd,
    da_usd,
    war_risk_usd,
    ets_usd,
    total_costs_usd,
    net_voyage_usd,
    daily_tce_usd,
    applicable,
    da_quality,
    war_risk_rate_date,
  } = breakdown;

  const warRiskRateTier = war_risk_rate_date && war_risk_usd > 0
    ? deriveTier({ asOf: war_risk_rate_date, staleAfterDays: 90 })
    : null;

  return (
    <div className="space-y-4 text-sm font-mono" data-testid="calculation-waterfall">

      {/* ── REVENUE PER VOYAGE ─────────────────────────────── */}
      <section className="space-y-1">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Revenue per voyage (what the charterer pays)
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">
            Freight rate × {quantity_mt.toLocaleString('en-US')} MT
          </span>
          <span className="text-gray-500 text-xs self-center">
            ${freight_rate_usd_per_mt}/MT × {quantity_mt.toLocaleString('en-US')} MT
          </span>
        </div>
        <div className="flex justify-between font-semibold border-b border-gray-200 pb-1">
          <span>= Revenue</span>
          <span data-testid="gross-freight">{fmtUsd(gross_freight_usd)}</span>
        </div>
      </section>

      {/* ── MINUS VOYAGE COSTS ─────────────────────────────── */}
      <section className="space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Minus voyage costs
        </div>

        {/* Bunker */}
        <div className="space-y-0.5" data-testid="cost-bunker">
          <div className="flex justify-between">
            <span>⛽ Bunker</span>
            <span>{fmtUsd(-bunker_usd)}</span>
          </div>
          <div
            className="text-xs text-gray-400 pl-4"
            data-testid="bunker-caption"
          >
            consumption {bunker_consumption_mt_per_day} MT/day · {duration_days.toFixed(1)} days · price ${bunker_price_usd_per_mt}/MT
          </div>
        </div>

        {/* Canals */}
        {canal_usd > 0 ? (
          <div className="flex justify-between" data-testid="cost-canal">
            <span>🚢 Canals</span>
            <span>{fmtUsd(-canal_usd)}</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400 pl-4" data-testid="canal-zero-note">
            🚢 Canals — $0 (route does not pass via Suez/Bosphorus)
          </div>
        )}

        {/* Port dues (DA) */}
        <div className="flex justify-between" data-testid="cost-da">
          <span>
            ⚓ Port dues
            {da_quality && da_quality.tier !== 'live' && (
              <span className="ml-1">
                <DataQualityBadge tier={da_quality.tier} asOf={da_quality.asOf} />
              </span>
            )}
          </span>
          <span>{fmtUsd(-da_usd)}</span>
        </div>

        {/* War risk */}
        <div className="space-y-0.5" data-testid="cost-war-risk">
          <div className="flex justify-between">
            <span>
              ⚔️ War risk
              {warRiskRateTier && warRiskRateTier !== 'live' && (
                <span
                  data-testid="war-risk-rate-badge"
                  className="ml-1"
                >
                  <DataQualityBadge tier={warRiskRateTier} asOf={war_risk_rate_date} />
                </span>
              )}
            </span>
            <span>{fmtUsd(-war_risk_usd)}</span>
          </div>
          <div
            className="text-xs text-gray-400 pl-4"
            data-testid="war-risk-caption"
          >
            shown, but does not affect $/day (excluded from TCE)
          </div>
        </div>

        {/* EU Carbon (ETS) */}
        {applicable.ets && ets_usd > 0 ? (
          <div className="flex justify-between" data-testid="cost-ets">
            <span>🌍 EU Carbon (ETS)</span>
            <span>{fmtUsd(-ets_usd)}</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400 pl-4" data-testid="ets-zero-note">
            🌍 EU Carbon — $0 (no EU ports on route)
          </div>
        )}

        {/* Total costs */}
        <div className="flex justify-between font-semibold border-b border-gray-200 pb-1">
          <span>= Total costs</span>
          <span>{fmtUsd(-total_costs_usd)}</span>
        </div>
      </section>

      {/* ── NET VOYAGE EARNINGS ─────────────────────────────── */}
      <div className="flex justify-between font-semibold">
        <span>Net voyage earnings</span>
        <span data-testid="net-voyage">{fmtUsd(net_voyage_usd)}</span>
      </div>

      {/* ── TCE BASIS (war-risk add-back when excluded from TCE) ─── */}
      {war_risk_usd > 0 && (
        <>
          <div className="flex justify-between text-gray-600 text-xs" data-testid="tce-basis-addback">
            <span>+ War risk added back to TCE basis</span>
            <span>{fmtUsd(war_risk_usd)}</span>
          </div>
          <div className="flex justify-between font-semibold" data-testid="tce-basis">
            <span>= Net for TCE</span>
            <span>{fmtUsd(net_voyage_usd + war_risk_usd)}</span>
          </div>
        </>
      )}

      {/* ── VOYAGE LENGTH ──────────────────────────────────── */}
      <div className="flex justify-between text-gray-600" data-testid="duration-days">
        <span>÷ Voyage length</span>
        <span>{duration_days.toFixed(1)} days</span>
      </div>

      {/* ── DAILY TCE ───────────────────────────────────────── */}
      <div
        className="flex justify-between font-bold text-base border-t-2 border-gray-800 pt-2"
        data-testid="daily-tce"
      >
        <span>💰 Daily TCE</span>
        <span>{fmtUsd(daily_tce_usd)}/day</span>
      </div>
    </div>
  );
}
