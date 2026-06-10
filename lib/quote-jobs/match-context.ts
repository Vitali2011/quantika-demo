import type Database from 'better-sqlite3';
import { getMatch } from '@/lib/matching/matches-repository';
import { getCurrentBenchmark } from '@/lib/market/benchmark';

export const INDICATIVE_SPREAD_PCT = 0.05;

export interface MatchQuoteContext {
  block: string;
  offeredRate: number;
  marketLow: number;
  marketHigh: number;
}

/**
 * Returns a numbers-only economics block for a match, or null if:
 *   - matchId is not a numeric DB id
 *   - the match doesn't exist
 *   - freight_rate_usd_per_mt is null (caller keeps the [RATE TO BE CONFIRMED] path)
 */
export async function buildMatchQuoteContext(
  db: Database.Database,
  matchId: string,
): Promise<MatchQuoteContext | null> {
  if (!/^\d+$/.test(matchId)) return null;
  const m = getMatch(db, Number(matchId));
  if (!m || m.freight_rate_usd_per_mt == null) return null;

  const offeredRate = m.freight_rate_usd_per_mt;
  const marketLow = offeredRate * (1 - INDICATIVE_SPREAD_PCT);
  const marketHigh = offeredRate * (1 + INDICATIVE_SPREAD_PCT);

  const tmi = await getCurrentBenchmark('TOEPFER_TMI').catch(() => null);

  const lines = [
    '=== MATCH ECONOMICS & MARKET DATA (use ONLY these numbers — do NOT invent or re-round a rate) ===',
    `Vessel: ${m.vessel_name ?? 'n/a'} (DWT ${m.vessel_dwt ?? 'n/a'})`,
    `Route: ${m.load_port ?? 'n/a'} → ${m.discharge_port ?? 'n/a'} (${m.distance_nm ?? 'n/a'} nm)`,
    `Computed TCE: USD ${m.tce_usd_per_day ?? 'n/a'}/day (freight source: ${m.freight_rate_source ?? 'n/a'})`,
    `Offered freight rate (INDICATIVE): USD ${offeredRate.toFixed(2)}/mt`,
    `Indicative market range for this route: USD ${marketLow.toFixed(2)}–${marketHigh.toFixed(2)}/mt`,
    tmi ? `Market benchmark (Toepfer TMI ${tmi.period}): USD ${tmi.value}/day TCE` : null,
    'Present the offered rate as INDICATIVE; cite the market range. Do NOT substitute a placeholder — use only the specific offered rate above.',
    '====================================================================================',
  ].filter(Boolean) as string[];

  return { block: lines.join('\n'), offeredRate, marketLow, marketHigh };
}
