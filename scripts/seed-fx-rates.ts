#!/usr/bin/env tsx
/**
 * Seed script: populates fx_rates with 30 days of real FX data from frankfurter.app (ECB).
 *
 * Pairs seeded (both directions):
 *   USD/EUR, USD/GBP, USD/CNY, EUR/GBP, EUR/CNY
 *
 * Usage:
 *   npx tsx scripts/seed-fx-rates.ts [--dry-run]
 *   npx tsx --env-file=.env.local scripts/seed-fx-rates.ts
 *
 * Idempotent: upsertFxRate uses ON CONFLICT DO UPDATE.
 */

import { getStore } from '@/lib/session-store';
import { upsertFxRate } from '@/lib/market/fx-rates-repository';

const BASE_URL = 'https://api.frankfurter.app';

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

async function fetchRates(
  from: string,
  to: string[],
  startDate: string,
  endDate: string,
): Promise<FrankfurterResponse> {
  const url = `${BASE_URL}/${startDate}..${endDate}?from=${from}&to=${to.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`frankfurter.app ${res.status}: ${url}`);
  }
  return res.json() as Promise<FrankfurterResponse>;
}

async function seed(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const db = getStore().getDb();
  const fetchedAt = new Date().toISOString();

  const today = new Date();
  const endDate = today.toISOString().split('T')[0]!;
  const start = new Date(today);
  start.setDate(start.getDate() - 29); // 30 days inclusive
  const startDate = start.toISOString().split('T')[0]!;

  console.log(`seed-fx-rates: ${startDate}..${endDate}${dryRun ? ' [DRY RUN]' : ''}`);

  let totalRows = 0;

  // Fetch 1: USD → EUR, GBP, CNY
  const usdData = await fetchRates('USD', ['EUR', 'GBP', 'CNY'], startDate, endDate);
  const usdDays = Object.keys(usdData.rates).length;
  console.log(`Fetched USD→EUR/GBP/CNY × ${usdDays} days = ${usdDays * 3} rows (+ ${usdDays * 3} inverse)`);

  for (const [date, quotes] of Object.entries(usdData.rates)) {
    for (const [quote, rate] of Object.entries(quotes)) {
      if (!dryRun) {
        upsertFxRate(db, { base_currency: 'USD', quote_currency: quote, rate, rate_date: date, source: 'frankfurter', fetched_at: fetchedAt });
        upsertFxRate(db, { base_currency: quote, quote_currency: 'USD', rate: 1 / rate, rate_date: date, source: 'frankfurter', fetched_at: fetchedAt });
      }
      totalRows += 2;
    }
  }

  // Fetch 2: EUR → GBP, CNY
  const eurData = await fetchRates('EUR', ['GBP', 'CNY'], startDate, endDate);
  const eurDays = Object.keys(eurData.rates).length;
  console.log(`Fetched EUR→GBP/CNY × ${eurDays} days = ${eurDays * 2} rows (+ ${eurDays * 2} inverse)`);

  for (const [date, quotes] of Object.entries(eurData.rates)) {
    for (const [quote, rate] of Object.entries(quotes)) {
      if (!dryRun) {
        upsertFxRate(db, { base_currency: 'EUR', quote_currency: quote, rate, rate_date: date, source: 'frankfurter', fetched_at: fetchedAt });
        upsertFxRate(db, { base_currency: quote, quote_currency: 'EUR', rate: 1 / rate, rate_date: date, source: 'frankfurter', fetched_at: fetchedAt });
      }
      totalRows += 2;
    }
  }

  const prefix = dryRun ? '[DRY RUN] ' : '';
  console.log(`${prefix}seed-fx-rates complete: ${totalRows} rows ${dryRun ? 'would be written' : 'inserted/updated'}`);
}

seed().catch((err) => {
  console.error('seed-fx-rates failed:', err);
  process.exit(1);
});
