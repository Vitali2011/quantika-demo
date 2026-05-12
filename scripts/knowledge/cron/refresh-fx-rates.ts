#!/usr/bin/env tsx
/**
 * Daily FX rates refresh cron script.
 *
 * Fetches EUR, GBP, NOK, AED rates from Frankfurter API (ECB-backed, free)
 * and upserts all pairs (forward + reverse) into fx_rates table.
 *
 * Exit 0: rates fetched and stored.
 * Exit 1: Frankfurter API failed.
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-fx-rates.ts
 */

import { getStore } from '@/lib/session-store';
import { upsertFxRate } from '@/lib/market/fx-rates-repository';

const CRON_NAME = 'fx-rates-daily';
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';
const QUOTE_CURRENCIES = ['EUR', 'GBP', 'NOK', 'AED'];

export async function main(): Promise<void> {
  console.log(`[${CRON_NAME}] Starting FX rates refresh...`);

  const db = getStore().getDb();
  const today = new Date().toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();

  try {
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

      // USD → QUOTE
      upsertFxRate(db, {
        base_currency: 'USD', quote_currency: quote,
        rate, rate_date: rateDate, source: 'frankfurter', fetched_at: fetchedAt,
      });

      // QUOTE → USD (inverse)
      upsertFxRate(db, {
        base_currency: quote, quote_currency: 'USD',
        rate: 1 / rate, rate_date: rateDate, source: 'frankfurter', fetched_at: fetchedAt,
      });
    }

    console.log(`[${CRON_NAME}] ✓ Stored ${QUOTE_CURRENCIES.length * 2} pairs for ${rateDate}`);
    process.exit(0);
  } catch (err) {
    console.error(`[${CRON_NAME}] ✗ Failed:`, err);
    process.exit(1);
  }
}

// Only run when executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`[${CRON_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}
