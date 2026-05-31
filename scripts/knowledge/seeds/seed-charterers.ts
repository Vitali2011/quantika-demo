/**
 * seed-charterers.ts
 *
 * Seeds the charterers table with realistic demo data (illustrative — no real credit feed).
 * Covers all three tiers: blue-chip, second, weak — with payment history and L/C flags.
 *
 * Usage:
 *   npx tsx scripts/knowledge/seeds/seed-charterers.ts
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 *
 * Idempotent: deterministic IDs derived from name; ON CONFLICT(id) DO UPDATE.
 */

import { createHash } from 'crypto';
import { getStore } from '../../../lib/session-store';
import { upsertCharterer } from '../../../lib/market/charterers-repository';

function deterministicId(name: string): string {
  return 'charterer-' + createHash('sha256').update(name).digest('hex').slice(0, 16);
}

interface DemoCharterer {
  name: string;
  tier: 'blue-chip' | 'second' | 'weak';
  require_lc: 0 | 1;
  notes: string | null;
  payment_history: { date: string; status: string; notes?: string }[];
}

const DEMO_CHARTERERS: DemoCharterer[] = [
  // ── Blue-chip ──────────────────────────────────────────────────────────────
  {
    name: 'Cargill',
    tier: 'blue-chip',
    require_lc: 0,
    notes: 'Long-standing relationship. Prefers FOB fixtures. Prompt payer.',
    payment_history: [
      { date: '2026-04-15', status: 'on-time', notes: 'MV Athena — Grain, $42/MT' },
      { date: '2026-02-10', status: 'on-time', notes: 'MV Pacific Star — Soya, $38/MT' },
      { date: '2025-11-22', status: 'on-time', notes: 'MV Baltic Wind — Corn, $35/MT' },
    ],
  },
  {
    name: 'ADM',
    tier: 'blue-chip',
    require_lc: 0,
    notes: 'Excellent track record. Handles large Panamax volumes.',
    payment_history: [
      { date: '2026-03-28', status: 'on-time', notes: 'MV Magellan — Wheat, $40/MT' },
      { date: '2026-01-15', status: 'on-time', notes: 'MV Neptune — Soya, $39/MT' },
      { date: '2025-10-05', status: 'on-time' },
    ],
  },
  {
    name: 'Glencore',
    tier: 'blue-chip',
    require_lc: 0,
    notes: 'Diversified commodity trader. Coal and grain. Strong credit.',
    payment_history: [
      { date: '2026-04-02', status: 'on-time', notes: 'MV Iron Eagle — Coal, $28/MT' },
      { date: '2026-01-30', status: 'on-time', notes: 'MV Atlantic Crown — Grain, $41/MT' },
      { date: '2025-09-18', status: 'on-time' },
    ],
  },
  {
    name: 'Viterra',
    tier: 'blue-chip',
    require_lc: 0,
    notes: 'Top global grain trader. Reliable payments within 5 days.',
    payment_history: [
      { date: '2026-04-20', status: 'on-time', notes: 'MV Golden Prairie — Barley, $36/MT' },
      { date: '2026-02-14', status: 'on-time' },
      { date: '2025-12-01', status: 'on-time' },
    ],
  },
  {
    name: 'Trafigura',
    tier: 'blue-chip',
    require_lc: 0,
    notes: 'Metals and energy focus. Well-capitalized. No credit concerns.',
    payment_history: [
      { date: '2026-03-10', status: 'on-time', notes: 'MV Ore Carrier III — Iron ore, $18/MT' },
      { date: '2025-12-15', status: 'on-time' },
      { date: '2025-08-20', status: 'on-time' },
    ],
  },

  // ── Second tier ────────────────────────────────────────────────────────────
  {
    name: 'Scorpio Tankers',
    tier: 'second',
    require_lc: 0,
    notes: 'Mostly liquid bulk. Occasional 5–10 day delay on remittance.',
    payment_history: [
      { date: '2026-04-08', status: 'late-5d', notes: 'Payment received 5 days after laycan' },
      { date: '2026-01-20', status: 'on-time' },
      { date: '2025-10-30', status: 'late-3d' },
    ],
  },
  {
    name: 'Pacific Basin',
    tier: 'second',
    require_lc: 0,
    notes: 'Minor bulk specialist. Good relationship but watch cashflow cycles.',
    payment_history: [
      { date: '2026-03-22', status: 'on-time' },
      { date: '2025-11-11', status: 'late-7d', notes: 'Confirmed delay due to bank processing' },
      { date: '2025-07-04', status: 'on-time' },
    ],
  },
  {
    name: 'Ultrabulk',
    tier: 'second',
    require_lc: 0,
    notes: 'Handysize and Supramax specialist. Track record mostly clean.',
    payment_history: [
      { date: '2026-02-28', status: 'on-time' },
      { date: '2025-12-10', status: 'on-time' },
      { date: '2025-09-02', status: 'late-4d', notes: 'Minor delay, resolved without dispute' },
    ],
  },
  {
    name: 'Bunge',
    tier: 'second',
    require_lc: 1,
    notes: 'Request L/C after two disputed demurrage claims in 2025.',
    payment_history: [
      { date: '2026-04-01', status: 'on-time', notes: 'L/C confirmed via Citi' },
      { date: '2025-12-20', status: 'disputed', notes: 'Demurrage dispute — resolved after arbitration' },
      { date: '2025-08-15', status: 'on-time' },
    ],
  },
  {
    name: 'COFCO',
    tier: 'second',
    require_lc: 0,
    notes: 'Chinese state-backed. Sound credit but some FX transfer delays.',
    payment_history: [
      { date: '2026-03-05', status: 'late-8d', notes: 'SAFE approval delay' },
      { date: '2025-10-18', status: 'on-time' },
      { date: '2025-06-22', status: 'late-6d', notes: 'FX remittance held by correspondent bank' },
    ],
  },

  // ── Weak ───────────────────────────────────────────────────────────────────
  {
    name: 'Medallion Shipping',
    tier: 'weak',
    require_lc: 1,
    notes: 'Repeated late payments and one unresolved demurrage. L/C mandatory.',
    payment_history: [
      { date: '2026-04-12', status: 'late-14d', notes: 'L/C presented; still 2-week delay' },
      { date: '2025-12-05', status: 'defaulted', notes: 'Unpaid demurrage $18,400 — legal pending' },
      { date: '2025-08-30', status: 'late-10d' },
    ],
  },
  {
    name: 'Horizon Dry Bulk',
    tier: 'weak',
    require_lc: 1,
    notes: 'Small operator with thin capitalisation. High counterparty risk.',
    payment_history: [
      { date: '2026-02-20', status: 'late-21d', notes: 'Required escalation to management' },
      { date: '2025-11-08', status: 'late-12d' },
      { date: '2025-06-15', status: 'on-time', notes: 'Early fixture before credit deterioration' },
    ],
  },
  {
    name: 'Levant Grain',
    tier: 'weak',
    require_lc: 1,
    notes: 'Active in MENA grain trades. Credit rating downgraded Q1 2026.',
    payment_history: [
      { date: '2026-04-30', status: 'late-9d' },
      { date: '2025-12-18', status: 'disputed', notes: 'Short-shipped claim unresolved' },
      { date: '2025-09-10', status: 'on-time' },
    ],
  },
];

export function seedCharterers(): void {
  const db = getStore().getDatabase();

  console.log('Seeding charterers (demo data — illustrative, no real credit feed)...');

  const byTier = { 'blue-chip': 0, second: 0, weak: 0 };

  for (const c of DEMO_CHARTERERS) {
    const id = deterministicId(c.name);

    upsertCharterer(db, {
      id,
      name: c.name,
      tier: c.tier,
      payment_history: JSON.stringify(c.payment_history),
      require_lc: c.require_lc,
      notes: c.notes,
    });

    byTier[c.tier]++;
    console.log(`  ✓ ${c.tier.padEnd(10)} ${c.name} (${id})`);
  }

  console.log(
    `\nSeeded ${DEMO_CHARTERERS.length} charterers:` +
    ` ${byTier['blue-chip']} blue-chip, ${byTier.second} second, ${byTier.weak} weak.`
  );
  console.log('NOTE: Demo data only — illustrative credit ratings, no real feed.');
}

if (require.main === module) {
  seedCharterers();
}
