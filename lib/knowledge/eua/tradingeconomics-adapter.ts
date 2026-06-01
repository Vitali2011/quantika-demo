// DEMO: interim HTML scrape of tradingeconomics.com for demonstration purposes.
// Production deployment requires a licensed API or official data source.
import type Database from 'better-sqlite3';
import { upsertEuaPrice, getLatestEuaPrice } from '@/lib/market/eua-repository';

const TE_URL = 'https://tradingeconomics.com/commodity/carbon';
const PRICE_MIN = 20;
const PRICE_MAX = 200;

export class TradingEconomicsParseError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TradingEconomicsParseError'; }
}

export type Fetcher = (url: string) => Promise<string>;

/**
 * Parse EUA spot price (EUR/tCO₂) from tradingeconomics.com/commodity/carbon HTML.
 * Tries JSON-in-script first (more stable), falls back to HTML element.
 */
export function parseTradingEconomicsHtml(html: string): { price: number; priceDate: string } {
  // Strategy 1: JSON object embedded in <script> — "Last":65.50 or "Last":65
  const jsonMatch = html.match(/"Last"\s*:\s*(\d+(?:\.\d+)?)/);
  if (jsonMatch) {
    const price = parseFloat(jsonMatch[1]);
    if (Number.isFinite(price)) {
      return { price, priceDate: new Date().toISOString().slice(0, 10) };
    }
  }

  // Strategy 2: data-value attribute on price span
  const dataMatch = html.match(/data-value="(\d+(?:\.\d+)?)"/);
  if (dataMatch) {
    const price = parseFloat(dataMatch[1]);
    if (Number.isFinite(price)) {
      return { price, priceDate: new Date().toISOString().slice(0, 10) };
    }
  }

  // Strategy 3: generic EUR price pattern near relevant context
  const eurMatch = html.match(/id="last-price"[^>]*>(\d+(?:\.\d+)?)/);
  if (eurMatch) {
    const price = parseFloat(eurMatch[1]);
    if (Number.isFinite(price)) {
      return { price, priceDate: new Date().toISOString().slice(0, 10) };
    }
  }

  throw new TradingEconomicsParseError(
    'Could not extract EUA price from tradingeconomics.com page — structure may have changed',
  );
}

/**
 * Fetch TradingEconomics carbon commodity page, parse EUA price, upsert to DB.
 *
 * Out-of-range price (< 20 or > 200 EUR/tCO₂): does NOT overwrite last-good price, logs warn.
 * Returns null on parse failure or blocked page; caller decides exit behaviour.
 */
export async function refreshTradingEconomics(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher,
): Promise<{ rowsChanged: number; priceDate: string; price: number } | null> {
  const raw = await fetcher(TE_URL);

  // Graceful-null: Cloudflare / paywall HTML that can't be parsed
  let price: number;
  let priceDate: string;
  try {
    ({ price, priceDate } = parseTradingEconomicsHtml(raw));
  } catch (e) {
    if (e instanceof TradingEconomicsParseError) {
      console.warn(`[TE] ${e.message}`);
      return null;
    }
    throw e;
  }

  if (price < PRICE_MIN || price > PRICE_MAX) {
    const existing = getLatestEuaPrice(db);
    console.warn(
      `[TE] Price ${price} EUR out of range [${PRICE_MIN}–${PRICE_MAX}] — ` +
      `keeping last-good (${existing?.price_eur_per_tco2 ?? 'none'} on ${existing?.price_date ?? 'n/a'})`,
    );
    return null;
  }

  upsertEuaPrice(db, {
    price_date: priceDate,
    price_eur_per_tco2: price,
    contract_type: 'spot',
    source: 'tradingeconomics',
    fetched_at: new Date().toISOString(),
  });

  return { rowsChanged: 1, priceDate, price };
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`TradingEconomics fetch failed: ${res.status} ${url}`);
  return res.text();
}
