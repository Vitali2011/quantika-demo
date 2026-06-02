# OilMonster bunker source — East-Med + Black Sea (Istanbul / Piraeus / Constanta)

**Date:** 2026-06-02
**Status:** Approved (design) — pending spec review
**Author:** Claude (brainstorming session with founder)

## Problem (human-level)

The demo's core trade region is **East-Med + Black Sea handysize bulk**. When a broker
computes a voyage (TCE) with bunkering at **Istanbul**, **Piraeus**, or **Constanta**, the
TCE endpoint returns **HTTP 422 `bunker_price_unavailable`** because `bunker_prices` has no
row for those ports (`app/api/voyage/tce/route.ts:239-243` — no fallback, no auto-skip).

So the most relevant load-region bunkering for this demo simply **errors out**.

## What the original task assumed vs. reality (verified 2026-06-02)

| Task premise                                    | Reality found                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "covers the Mediterranean via OilMonster"       | **No OilMonster code exists** anywhere in the repo.                                                                                                                                                                                                                     |
| `app/api/voyage/bunker-recommendation/route.ts` | **Does not exist.** Bunker consumers: `tce`, `compare-routes`, `market/bunker-kpi`.                                                                                                                                                                                     |
| "add TRIST/GRPIR to Ship&Bunker PORT_MAP"       | **Already present** (`shipandbunker-adapter.ts:45-46`) — but **dead**: the free S&B global `/prices` page only quotes world hubs (Rotterdam, Singapore, Fujairah, Houston, Gibraltar, NY, LA, HK, Santos).                                                              |
| "Ship&Bunker reportedly lists Istanbul"         | S&B's **regional** Med & Black Sea page (`/prices/emea/medabs`) lists the ports but **paywalls the prices** ("log in to view prices / subscribe from $59"). We will **not** scrape a paywall.                                                                           |
| `bunker_prices` lives in `data/demo-seed.db`    | Locally it's `data/sessions.db`. On **prod** `getStore().getDb()` opens the prod DB via `SESSIONS_DB_PATH` (demo-mode). The cron writes and TCE reads the **same** DB → running `refresh-bunker` on prod is the correct, sufficient mechanism (no separate seed-patch). |
| `port-master.json` may need new ports           | **Already has** Istanbul/Piraeus/Constanta with UNLOCODE + lat/lon. **No change needed.**                                                                                                                                                                               |

## Decision

Add a new **OilMonster** adapter as a third live bunker source. OilMonster publishes
**free** per-port VLSFO pages, reachable with a browser User-Agent (HTTP 200):

| Port      | UNLOCODE | OilMonster page                                     | Live VLSFO (2026-06-02) | Price date     | Live?          |
| --------- | -------- | --------------------------------------------------- | ----------------------- | -------------- | -------------- |
| Istanbul  | TRIST    | `/bunker-fuel-prices/istanbul-vlsfo-price/239/91`   | 947.00                  | 2026-05-25     | ✅ fresh       |
| Piraeus   | GRPIR    | `/bunker-fuel-prices/piraeus-vlsfo-price/239/97`    | 889.25                  | 2026-05-26     | ✅ fresh       |
| Constanta | ROCND    | `/bunker-fuel-prices/constantza-vlsfo-price/239/47` | 585.00                  | **2024-09-12** | ❌ stale ~20mo |

**Constanta is dormant** on OilMonster (Black Sea is rarely quoted). Per founder decision,
Constanta is a **documented proxy**: `ROCND = live Istanbul VLSFO + Black-Sea premium`,
recomputed every refresh, stored with `source = 'oilmonster-proxy'` so it is honestly
labelled as derived. We do **not** ingest the dead 2024 number.

## Architecture

### New: `lib/knowledge/bunker/oilmonster-adapter.ts`

Mirrors `shipandbunker-adapter.ts` patterns (pure parser + refresh orchestrator +
injectable fetcher + typed errors). No file cache (2 live fetches/day — YAGNI).

**Pure parser — one port page at a time:**

```ts
export function parseOilMonsterHtml(html: string): { vlsfo: number; priceDate: string };
```

- Current price: anchor on `<div class="scrapitemprice">`, take the first
  `([\d,]+\.\d{2})` immediately before `<span>$US/MT`. Strip commas → `parseFloat`.
  The non-greedy match skips the `<i>` arrow icon.
- Price date: `/Price Date\s*:\s*<span[^>]*>\s*(\d{4}-\d{2}-\d{2})/`.
- **Must ignore the history table** (`Week/Month/Year High-Low` cells use
  `class="spprice"` / `class="sphead"`, e.g. 1007.00 / 752.00 / 527.00) — the
  `scrapitemprice` anchor guarantees we read the _current_ value (947.00), not history.
- Sanity: page must contain `$US/MT` and an `scrapitemprice` block, else throw
  `OilMonsterStructureChangedError`. Non-numeric price → `OilMonsterParseError`.

**Refresh orchestrator:**

```ts
export async function refreshOilMonster(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
  opts: { now?: Date } = {}
): Promise<{ rowsChanged: number }>;
```

- Port→URL map (live): `TRIST → istanbul/239/91`, `GRPIR → piraeus/239/97`.
- For each live port: fetch → parse → **staleness guard** (skip if `now − priceDate >
MAX_AGE_DAYS`, default 30) → `upsertBunkerPrice({ source:'oilmonster', fuel_grade:'VLSFO' })`.
- **Constanta proxy:** only if Istanbul (TRIST) was fetched **and kept** (fresh):
  `ROCND = round(istanbulVlsfo + BLACK_SEA_PREMIUM_USD, 2)`, `price_date = istanbul.priceDate`,
  `source = 'oilmonster-proxy'`. If Istanbul failed/stale → skip Constanta (no basis).
- **Resilience:** per-port fetch/parse errors are caught and collected; a single bad port
  does not abort the run. If **0 rows** changed → throw (so the cron marks the source failed).
- Constants (documented in code): `BLACK_SEA_PREMIUM_USD = 40`, `MAX_AGE_DAYS = 30`.
- `defaultFetcher`: `fetch` with a **browser-like User-Agent** (the existing
  `Quantika-Demo/1.0` UA gets 403 from OilMonster), `AbortSignal.timeout(30_000)`.

### Wire-in: `scripts/knowledge/cron/refresh-bunker.ts`

Add a third source alongside USDA + Ship&Bunker:

```ts
const okOM = await runOne(db, "bunker-oilmonster", refreshOilMonster);
process.exit(okUsda || okSnB || okOM ? 0 : 1);
```

### Source registration: `lib/knowledge/bootstrap.ts`

Add a `registerSource` entry `slug: 'bunker-oilmonster'` (mirror the `bunker-shipandbunker`
block near line 144): `kind:'structured_rows'`, `category:'market'`,
`source_url:'https://www.oilmonster.com/bunker-price'`, `refresh_mode:'auto-daily'`,
`stale_threshold_days: 2`, `primary_table:'bunker_prices'`.

### Cleanup: `lib/knowledge/bunker/shipandbunker-adapter.ts`

Remove the **dead** `Piraeus`/`Istanbul` entries from `LOCATION_TO_UNLOCODE` (the free S&B
page never returns them; they misled the original task). Add a one-line comment pointing to
the OilMonster adapter for Med/Black Sea coverage. (Pure cleanup — no behaviour change.)

## Data flow

```
refresh-bunker.ts (cron, prod, founder-authorized)
  └─ refreshOilMonster(getStore().getDb())
       ├─ fetch Istanbul page → parse → fresh? → upsert TRIST  (source=oilmonster)
       ├─ fetch Piraeus  page → parse → fresh? → upsert GRPIR  (source=oilmonster)
       └─ derive Constanta = Istanbul + $40   → upsert ROCND  (source=oilmonster-proxy)
                                                   │
TCE / compare-routes / bunker-kpi  ← getLatestBunkerPrice(db, port, 'VLSFO')  ← same DB
```

After deploy + prod refresh, TCE for Istanbul/Piraeus/Constanta returns a price instead of 422.

## Error handling & guards

- `OilMonsterStructureChangedError` — page markup changed (no `scrapitemprice`/`$US/MT`).
- `OilMonsterParseError` — price present but non-numeric.
- Staleness skip — protects against dormant feeds (auto-excludes the dead Constanta number).
- Per-port isolation — one failing port ≠ whole-source failure.
- Zero-rows → throw — cron records the failure in `knowledge_sync_log`.

## Testing (TDD, deterministic, no live network in CI)

New: `__tests__/lib/knowledge/bunker/oilmonster-adapter.test.ts`
Fixtures captured 2026-06-02 → `__tests__/fixtures/oilmonster-{istanbul,piraeus,constantza}-2026-06-02.html`.

- `parseOilMonsterHtml`: Istanbul → `947.00 / 2026-05-25`; Piraeus → `889.25 / 2026-05-26`;
  Constantza → `585.00 / 2024-09-12`.
- **History-table trap:** Istanbul fixture returns 947.00 (current), not 1007.00 (history high).
- Structure-changed throw on HTML lacking `scrapitemprice` / `$US/MT`; parse-error on non-numeric.
- `refreshOilMonster` with injected fetcher + `now = 2026-06-02`:
  - inserts TRIST + GRPIR (`source=oilmonster`, `fuel_grade=VLSFO`);
  - **staleness:** a stale-dated Istanbul/Piraeus fixture is **skipped** (not upserted);
  - **proxy:** ROCND inserted = `istanbul + 40`, `source=oilmonster-proxy`, date = Istanbul's;
  - proxy **not** inserted when Istanbul fetch throws;
  - all ports failing → rejects.

Then **`/test-skill` cold adversarial QA** on the parser branch (risk-override: HTML/price parser).

## Out of scope (YAGNI / surgical)

- MGO/LSMGO grades (TCE defaults to VLSFO; add later if needed).
- Extra OilMonster ports (Izmit, Novorossiysk) — only the 3 named.
- File cache for OilMonster fetches.
- UI work — this is a data-layer fix; consumers read via `getLatestBunkerPrice`.
- `port-master.json` — ports already present.

## Deploy

After merge: running `refresh-bunker` on **prod** is **founder-authorized but must be asked
first** (it fetches OilMonster live and writes the prod DB). The browser User-Agent is required
or OilMonster returns 403.
