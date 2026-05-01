/**
 * Insert: economics breakdown — TCE, bunker, war-risk, ETS.
 * Reuses the β-05 voyage-calculator TCEBreakdown shape.
 * Spec β-13.
 */
import type { InsertResult } from './index';

export interface EconomicsBreakdown {
  bunker_usd: number;
  canal_usd: number;
  da_usd: number;
  war_risk_usd: number;
  ets_eur: number;
  ets_usd: number;
  gross_freight_usd: number;
  total_costs_usd: number;
  net_voyage_usd: number;
  daily_tce_usd: number;
  applicable: {
    bunker: boolean;
    canal: boolean;
    da: boolean;
    war_risk: boolean;
    ets: boolean;
  };
}

export interface EconomicsPayload {
  voyageId: string;
  breakdown: EconomicsBreakdown;
}

export interface EconomicsOpts {
  fetcher?: (voyageId: string) => Promise<EconomicsPayload | null>;
}

const defaultFetcher = async (voyageId: string): Promise<EconomicsPayload | null> => {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`/api/voyage/${encodeURIComponent(voyageId)}/economics`);
    if (!res.ok) return null;
    return (await res.json()) as EconomicsPayload;
  } catch {
    return null;
  }
};

export async function buildEconomicsInsert(
  voyageId: string,
  opts: EconomicsOpts = {},
): Promise<InsertResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const data = await fetcher(voyageId);

  if (!data) {
    const html = `<div>Voyage ${esc(voyageId)} — economics not available</div>`;
    const plain = `Voyage ${voyageId}: economics n/a`;
    return { html, plain };
  }

  const b = data.breakdown;
  const fmt = (n: number): string => n.toLocaleString('en-US');

  const html =
    `<table border="1" cellpadding="4" cellspacing="0">` +
    `<thead><tr><th>Metric</th><th>USD</th></tr></thead>` +
    `<tbody>` +
    `<tr><td>Daily TCE</td><td>${fmt(b.daily_tce_usd)}</td></tr>` +
    `<tr><td>Bunker</td><td>${fmt(b.bunker_usd)}</td></tr>` +
    `<tr><td>War risk</td><td>${fmt(b.war_risk_usd)}</td></tr>` +
    `<tr><td>ETS (EUR ${fmt(b.ets_eur)})</td><td>${fmt(b.ets_usd)}</td></tr>` +
    `<tr><td>Canal</td><td>${fmt(b.canal_usd)}</td></tr>` +
    `<tr><td>DA</td><td>${fmt(b.da_usd)}</td></tr>` +
    `<tr><td>Gross freight</td><td>${fmt(b.gross_freight_usd)}</td></tr>` +
    `<tr><td>Total costs</td><td>${fmt(b.total_costs_usd)}</td></tr>` +
    `<tr><td>Net voyage</td><td>${fmt(b.net_voyage_usd)}</td></tr>` +
    `</tbody></table>`;

  const plain =
    `Voyage ${data.voyageId} economics:\n` +
    `Daily TCE\t${b.daily_tce_usd}\n` +
    `Bunker\t${b.bunker_usd}\n` +
    `War risk\t${b.war_risk_usd}\n` +
    `ETS\t${b.ets_usd} USD (${b.ets_eur} EUR)\n` +
    `Canal\t${b.canal_usd}\n` +
    `DA\t${b.da_usd}\n` +
    `Gross freight\t${b.gross_freight_usd}\n` +
    `Total costs\t${b.total_costs_usd}\n` +
    `Net voyage\t${b.net_voyage_usd}`;

  return { html, plain };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
