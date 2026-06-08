/**
 * CalculationWaterfall — "Показать расчёт" expandable transparent-math panel.
 *
 * Pure presentational component. Renders the approved waterfall layout:
 *   ВЫРУЧКА ЗА РЕЙС → МИНУС РАСХОДЫ → ЧИСТЫМИ ЗА РЕЙС → ÷ дней → ЗАРАБОТОК В ДЕНЬ
 *
 * Uses the same fmtUsd broker convention as VoyageBreakdownChart: -$X not $-X.
 * Russian labels — founder-facing UI.
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

      {/* ── ВЫРУЧКА ЗА РЕЙС ───────────────────────────────── */}
      <section className="space-y-1">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Выручка за рейс (что платит фрахтователь)
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">
            Ставка фрахта × {quantity_mt.toLocaleString('en-US')} т
          </span>
          <span className="text-gray-500 text-xs self-center">
            ${freight_rate_usd_per_mt}/т × {quantity_mt.toLocaleString('en-US')} т
          </span>
        </div>
        <div className="flex justify-between font-semibold border-b border-gray-200 pb-1">
          <span>= Выручка</span>
          <span data-testid="gross-freight">{fmtUsd(gross_freight_usd)}</span>
        </div>
      </section>

      {/* ── МИНУС РАСХОДЫ РЕЙСА ───────────────────────────── */}
      <section className="space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Минус расходы рейса
        </div>

        {/* Топливо */}
        <div className="space-y-0.5" data-testid="cost-bunker">
          <div className="flex justify-between">
            <span>⛽ Топливо</span>
            <span>{fmtUsd(-bunker_usd)}</span>
          </div>
          <div
            className="text-xs text-gray-400 pl-4"
            data-testid="bunker-caption"
          >
            расход {bunker_consumption_mt_per_day} т/день · {duration_days.toFixed(1)} дн · цена ${bunker_price_usd_per_mt}/т
          </div>
        </div>

        {/* Каналы */}
        {canal_usd > 0 ? (
          <div className="flex justify-between" data-testid="cost-canal">
            <span>🚢 Каналы</span>
            <span>{fmtUsd(-canal_usd)}</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400 pl-4" data-testid="canal-zero-note">
            🚢 Каналы — $0 (маршрут не идёт через Суэц/Босфор)
          </div>
        )}

        {/* Портовые сборы (DA) */}
        <div className="flex justify-between" data-testid="cost-da">
          <span>
            ⚓ Портовые сборы
            {da_quality && da_quality.tier !== 'live' && (
              <span className="ml-1">
                <DataQualityBadge tier={da_quality.tier} asOf={da_quality.asOf} />
              </span>
            )}
          </span>
          <span>{fmtUsd(-da_usd)}</span>
        </div>

        {/* Военный риск */}
        <div className="space-y-0.5" data-testid="cost-war-risk">
          <div className="flex justify-between">
            <span>
              ⚔️ Военный риск
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
            показано, но не влияет на $/день (исключён из расчёта TCE)
          </div>
        </div>

        {/* Углеродный ЕС (ETS) */}
        {applicable.ets && ets_usd > 0 ? (
          <div className="flex justify-between" data-testid="cost-ets">
            <span>🌍 Углеродный ЕС (ETS)</span>
            <span>{fmtUsd(-ets_usd)}</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400 pl-4" data-testid="ets-zero-note">
            🌍 Углеродный ЕС — $0 (ни один порт не в ЕС)
          </div>
        )}

        {/* Итого расходы */}
        <div className="flex justify-between font-semibold border-b border-gray-200 pb-1">
          <span>= Все расходы</span>
          <span>{fmtUsd(-total_costs_usd)}</span>
        </div>
      </section>

      {/* ── ЧИСТЫМИ ЗА РЕЙС ──────────────────────────────── */}
      <div className="flex justify-between font-semibold">
        <span>Чистыми за рейс</span>
        <span data-testid="net-voyage">{fmtUsd(net_voyage_usd)}</span>
      </div>

      {/* ── TCE BASIS (war-risk add-back when excluded from TCE) ─── */}
      {war_risk_usd > 0 && (
        <>
          <div className="flex justify-between text-gray-600 text-xs" data-testid="tce-basis-addback">
            <span>+ Военный риск возвращён в базу TCE</span>
            <span>{fmtUsd(war_risk_usd)}</span>
          </div>
          <div className="flex justify-between font-semibold" data-testid="tce-basis">
            <span>= Чистыми для TCE</span>
            <span>{fmtUsd(net_voyage_usd + war_risk_usd)}</span>
          </div>
        </>
      )}

      {/* ── ДЛИНА РЕЙСА ──────────────────────────────────── */}
      <div className="flex justify-between text-gray-600" data-testid="duration-days">
        <span>÷ Длина рейса</span>
        <span>{duration_days.toFixed(1)} дней</span>
      </div>

      {/* ── ЗАРАБОТОК В ДЕНЬ (TCE) ───────────────────────── */}
      <div
        className="flex justify-between font-bold text-base border-t-2 border-gray-800 pt-2"
        data-testid="daily-tce"
      >
        <span>💰 Заработок в день</span>
        <span>{fmtUsd(daily_tce_usd)}/день</span>
      </div>
    </div>
  );
}
