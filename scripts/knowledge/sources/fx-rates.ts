#!/usr/bin/env tsx
/**
 * FX rates source handler for knowledge refresh dispatcher.
 *
 * Fetches latest USD/EUR/GBP/NOK/AED rates from Frankfurter API (ECB-backed)
 * and upserts pairs (forward + reverse) into fx_rates table.
 *
 * Called by:  npm run knowledge:refresh fx-rates
 *
 * Idempotent: upsertFxRate uses ON CONFLICT DO UPDATE.
 */

import { getStore } from '@/lib/session-store';
import { upsertFxRate } from '@/lib/market/fx-rates-repository';

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';
const QUOTE_CURRENCIES = ['EUR', 'GBP', 'NOK', 'AED'];
const SOURCE_NAME = 'knowledge/fx-rates';

export async function refresh(): Promise<void> {
  console.log(`[${SOURCE_NAME}] Starting FX rates refresh...`);

  const db = getStore().getDb();
  const today = new Date().toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();

  const url = `${FRANKFURTER_URL}?from=USD&to=${QUOTE_CURRENCIES.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter returned HTTP ${res.status}`);
  }
  const data = await res.json() as { date: string; rates: Record<string, number> };
  const rateDate = data.date ?? today;

  for (const quote of QUOTE_CURRENCIES) {
    const rate = data.rates[quote];
    if (typeof rate !== 'number' || rate <= 0) continue;

    upsertFxRate(db, {
      base_currency: 'USD', quote_currency: quote,
      rate, rate_date: rateDate, source: 'frankfurter', fetched_at: fetchedAt,
    });

    upsertFxRate(db, {
      base_currency: quote, quote_currency: 'USD',
      rate: 1 / rate, rate_date: rateDate, source: 'frankfurter', fetched_at: fetchedAt,
    });
  }

  console.log(`[${SOURCE_NAME}] Stored ${QUOTE_CURRENCIES.length * 2} pairs for ${rateDate}`);
}

// Allow direct execution: npx tsx scripts/knowledge/sources/fx-rates.ts
if (require.main === module) {
  refresh().catch((err) => {
    console.error(`[${SOURCE_NAME}] Fatal:`, err);
    process.exit(1);
  });
}
