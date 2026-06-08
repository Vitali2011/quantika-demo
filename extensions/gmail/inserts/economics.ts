/**
 * Insert: economics breakdown — TCE and freight rate from a stored match row.
 * Fetches GET /api/matches/[id] (returns StoredMatch with tce_usd_per_day).
 * Spec β-13.
 */
import type { InsertResult } from './index';

interface MatchData {
  tce_usd_per_day: number | null;
  freight_rate_usd_per_mt: number | null;
  load_port: string | null;
  discharge_port: string | null;
}

export interface EconomicsOpts {
  fetcher?: (matchId: string) => Promise<MatchData | null>;
}

const defaultFetcher = async (matchId: string): Promise<MatchData | null> => {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`);
    if (!res.ok) return null;
    return (await res.json()) as MatchData;
  } catch {
    return null;
  }
};

export async function buildEconomicsInsert(
  matchId: string,
  opts: EconomicsOpts = {},
): Promise<InsertResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const data = await fetcher(matchId);

  if (!data || data.tce_usd_per_day == null) {
    const html = `<div>Match ${esc(matchId)} — economics not available</div>`;
    const plain = `Match ${matchId}: economics n/a`;
    return { html, plain };
  }

  const fmt = (n: number): string => n.toLocaleString('en-US');

  const route = [data.load_port, data.discharge_port].filter(Boolean).join(' → ');

  const html =
    `<table border="1" cellpadding="4" cellspacing="0">` +
    `<thead><tr><th>Metric</th><th>Value</th></tr></thead>` +
    `<tbody>` +
    `<tr><td>Daily TCE</td><td>$${fmt(data.tce_usd_per_day)}/day</td></tr>` +
    (data.freight_rate_usd_per_mt != null
      ? `<tr><td>Freight rate</td><td>$${fmt(data.freight_rate_usd_per_mt)}/mt</td></tr>`
      : '') +
    (route ? `<tr><td>Route</td><td>${esc(route)}</td></tr>` : '') +
    `</tbody></table>`;

  const plain =
    `Match ${matchId} economics:\n` +
    `Daily TCE\t${fmt(data.tce_usd_per_day)} USD/day\n` +
    (data.freight_rate_usd_per_mt != null
      ? `Freight rate\t${fmt(data.freight_rate_usd_per_mt)} USD/mt\n`
      : '') +
    (route ? `Route\t${route}` : '');

  return { html, plain };
}

// BUG-β-13-EconomicsZeroPath: extend escape to cover " and ' for attribute
// contexts.
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
