/**
 * seed-market-indices.ts
 *
 * Seeds 30 days of synthetic BHSI + TMI data for demo purposes.
 *
 * Usage:
 *   npx tsx scripts/knowledge/seeds/seed-market-indices.ts
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 *
 * Idempotent: uses upsertIndex (ON CONFLICT(index_name, index_date) DO UPDATE).
 */

import { getStore } from '../../../lib/session-store';
import { upsertIndex } from '../../../lib/market/market-indices-repository';

function generateSyntheticData(
  indexName: string,
  days: number,
  baseValue: number,
  variance: number,
): Array<{ date: string; value: number }> {
  const data: Array<{ date: string; value: number }> = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const randomOffset = (Math.random() - 0.5) * variance;
    const value = Math.round(baseValue + randomOffset);

    data.push({ date: dateStr, value });
  }

  return data.reverse();
}

export function seedMarketIndices(): void {
  const db = getStore().getDatabase();

  console.log('Seeding market indices with 30 days of synthetic data...\n');

  // BHSI: range 300-600 USD/day
  const bhsiData = generateSyntheticData('bhsi', 30, 450, 300);
  console.log('Seeding BHSI (Baltic Handysize Index)...');
  for (const row of bhsiData) {
    const id = `bhsi-${row.date}`;
    upsertIndex(db, {
      id,
      index_name: 'bhsi',
      index_date: row.date,
      value: row.value,
      unit: 'USD/day',
      source: 'seed-synthetic',
      fetched_at: new Date().toISOString(),
    });
  }
  console.log(`  ✓ Seeded ${bhsiData.length} BHSI rows`);

  // TMI: range 500-900 USD/day
  const tmiData = generateSyntheticData('tmi', 30, 700, 400);
  console.log('Seeding TMI (TransAtlantic Index)...');
  for (const row of tmiData) {
    const id = `tmi-${row.date}`;
    upsertIndex(db, {
      id,
      index_name: 'tmi',
      index_date: row.date,
      value: row.value,
      unit: 'USD/day',
      source: 'seed-synthetic',
      fetched_at: new Date().toISOString(),
    });
  }
  console.log(`  ✓ Seeded ${tmiData.length} TMI rows`);

  // Drewry WCI composite: range ~$1500-1700 USD/FEU (per 40ft container)
  const drewryData = generateSyntheticData('drewry-bb', 30, 1600, 200);
  console.log('Seeding Drewry WCI composite (drewry-bb)...');
  for (const row of drewryData) {
    const id = `drewry-bb-${row.date}`;
    upsertIndex(db, {
      id,
      index_name: 'drewry-bb',
      index_date: row.date,
      value: row.value,
      unit: 'USD/FEU',
      source: 'seed-synthetic',
      fetched_at: new Date().toISOString(),
    });
  }
  console.log(`  ✓ Seeded ${drewryData.length} Drewry BB rows`);

  console.log(`\n✓ Seeded total ${bhsiData.length + tmiData.length + drewryData.length} market index rows.`);
}

if (require.main === module) {
  seedMarketIndices();
}
