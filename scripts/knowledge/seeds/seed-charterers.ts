/**
 * seed-charterers.ts
 *
 * Seeds the charterers table with 20 blue-chip charterers.
 *
 * Usage:
 *   npx tsx scripts/knowledge/seeds/seed-charterers.ts
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 *
 * Idempotent: uses upsertCharterer (ON CONFLICT(id) DO UPDATE).
 */

import { getStore } from '../../../lib/session-store';
import { upsertCharterer } from '../../../lib/market/charterers-repository';
import { randomBytes } from 'crypto';

const BLUE_CHIP_CHARTERERS = [
  'Cargill',
  'ADM',
  'Bunge',
  'Louis Dreyfus',
  'Glencore',
  'Viterra',
  'Trafigura',
  'Gunvor',
  'Mercuria',
  'Koch Industries',
  'COFCO',
  'Olam',
  'Noble Group',
  'Wilmar',
  'Pacific Basin',
  'Stena',
  'MOL',
  'NYK',
  'MSC',
  'CMA CGM',
];

export function seedCharterers(): void {
  const db = getStore().getDatabase();

  console.log('Seeding charterers...');

  for (const name of BLUE_CHIP_CHARTERERS) {
    const id = `charterer-${randomBytes(8).toString('hex')}`;

    upsertCharterer(db, {
      id,
      name,
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    console.log(`  ✓ Seeded: ${name} (${id})`);
  }

  console.log(`\nSeeded ${BLUE_CHIP_CHARTERERS.length} blue-chip charterers.`);
}

if (require.main === module) {
  seedCharterers();
}
