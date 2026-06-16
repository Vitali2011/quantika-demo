import { buildQuotePrompt } from '@/lib/quote-jobs/prompt';

const cargo = { emailId: 'e1', cargoType: 'grain', cargoDescription: 'wheat in bulk' };
const email = { id: 'e1', from: 'broker@acme.com', fromName: 'Jane Broker', subject: 'Wheat fixture', body: 'Need a quote' };

it('builds a system + user prompt addressed to the resolved sender', async () => {
  const { system, user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).toContain('freight quote writer'); // from DRAFT_QUOTE_SYSTEM_PROMPT
  expect(user).toContain('Jane Broker'); // resolveSenderName output
});

it('user prompt matches frozen template — guards against route divergence', async () => {
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(user).toMatchInlineSnapshot(`
"
Parsed cargo inquiry data:
{
  "emailId": "e1",
  "cargoType": "grain",
  "cargoDescription": "wheat in bulk"
}

Original email:
From: broker@acme.com
Subject: Wheat fixture
Body: Need a quote

Address the reply to: Jane Broker

Generate a professional draft quote email."
`);
});

it('omits RAG context when ragEnabled is false', async () => {
  const { system } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).not.toContain('IMSBC Cargo Safety Context');
});

// ── Stage 10b: match economics block ──────────────────────────────────────────

import Database from 'better-sqlite3';

// Mock getCurrentBenchmark to avoid network in tests
jest.mock('@/lib/market/benchmark', () => ({
  getCurrentBenchmark: jest.fn().mockResolvedValue(null),
}));

function buildMatchDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cargo_id TEXT NOT NULL DEFAULT '',
      vessel_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      tce_usd_per_day REAL,
      distance_nm REAL,
      freight_rate_usd_per_mt REAL,
      freight_rate_source TEXT,
      vessel_name TEXT,
      vessel_dwt REAL,
      load_port TEXT,
      discharge_port TEXT
    )
  `);
  const r = db.prepare(`
    INSERT INTO matches (vessel_name, vessel_dwt, load_port, discharge_port, tce_usd_per_day, freight_rate_usd_per_mt, freight_rate_source, distance_nm)
    VALUES ('MV GRAIN', 52000, 'Rotterdam', 'Jeddah', 14000, 18.00, 'computed', 6800)
  `).run();
  return { db, matchId: String(r.lastInsertRowid) };
}

it('injects the match economics block + indicative-rate instruction when matchId is given', async () => {
  const { db, matchId } = buildMatchDb();
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false, matchId, db });
  expect(user).toContain('MATCH ECONOMICS');
  expect(user).toMatch(/indicative/i);
  expect(user).not.toContain('[RATE TO BE CONFIRMED]');
  expect(user).toContain('18.00');
});

it('matchId omitted → no economics block (cargo path unchanged)', async () => {
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(user).not.toContain('MATCH ECONOMICS');
});

it('matchId given but unknown match → no economics block (fallback to cargo path)', async () => {
  const { db } = buildMatchDb();
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false, matchId: '999999', db });
  expect(user).not.toContain('MATCH ECONOMICS');
});

// ── #1018: date anchor in the system prompt (demo/live gated via lib/clock.today) ──

import { today } from '@/lib/clock';

it('anchors the system prompt to nowIso so future laycans are not called elapsed (#1018)', async () => {
  const { system, user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false, nowIso: '2026-05-28' });
  expect(system).toContain('2026-05-28');
  expect(system).toMatch(/do not describe.*elapsed/i);
  // user prompt (frozen-template snapshot) stays untouched — date lives in system only
  expect(user).not.toContain('2026-05-28');
});

it('omits the date anchor when nowIso is not provided (back-compat)', async () => {
  const { system } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).not.toMatch(/CURRENT DATE/);
});

it('live mode (DEMO_MODE unset): quote prompt carries the REAL date, not frozen 2026-05-28', async () => {
  const saved = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;
  try {
    const realIso = today(); // lib/clock — frozen only under DEMO_MODE; real wall-clock otherwise
    const expected = new Date().toISOString().slice(0, 10);
    expect(realIso).toBe(expected);
    expect(realIso).not.toBe('2026-05-28');
    const { system } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false, nowIso: realIso });
    expect(system).toContain(expected);
    expect(system).not.toContain('2026-05-28');
  } finally {
    if (saved === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved;
  }
});
