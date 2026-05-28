# Opus Seed Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Quantika demo DB once via Opus 4.8 (hybrid clerk+analyst), anonymized, prod-only — never in the public git repo.

**Architecture:** A deterministic per-email parse spine (existing `parse-llm-direct.ts`, routed to the `claude-cli` provider = Opus 4.8 via the user's subscription) writes `.llm-cache/<hash>.json`. A new Opus "reconciliation" pass (`reconcile.ts`) reads that cache, groups entity names across emails, and emits a deterministic anonymization map. `analyze.ts` (existing) consumes that map and computes date offsets; `build.ts` (existing) applies shift+anonymization and writes `data/demo-seed.db`. New `validators.ts` enforces leak=0 / schema / sanity and prints an Opus-free summary. `deploy.sh` scp's the DB to prod.

**Tech Stack:** TypeScript, `tsx` (script runner), jest + ts-jest (tests), better-sqlite3, zod (manifest schema), `@/lib/ai-provider` (`callAiJson`/`callAiText` auto-route to `claude-cli` when `AI_PROVIDER=claude-cli`).

**Important context for the implementer:**
- The `claude-cli` provider is selected by env: `<SCOPE>_PROVIDER` → `AI_PROVIDER` → default. `callAiJson`/`callAiText` route to it automatically. The only runtime guard throws when `process.env.NEXT_RUNTIME` is set — `tsx` scripts do NOT set it, so claude-cli works from scripts. `callClaudeCliRaw` passes `--model <opts.model ?? getModel(scope)>`; `getModel` default for claude-cli is the literal `'claude-opus-4-7'`, so to use 4.8 you MUST pass `opts.model = 'claude-opus-4-8'` (or set `*_MODEL` env).
- Gemini `responseSchema` is ignored by claude-cli; `callAiJson` extracts JSON from raw text via `extractJson`. Keep passing `responseSchema` (harmless) — it documents intent.
- Dual-key invariant: offsets are keyed by `threadId`; cache rows + `parsed_results` are keyed by `messageId` (`= messages[0].id`, stored as `gmail_message_id`). Keep both consistent.
- Run a single demo-seed test file with: `npx jest scripts/demo-seed/<file>`. Run a script with: `npx tsx scripts/demo-seed/<file>.ts`.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `.gitignore` | Modify | Stop tracking `data/demo-seed.db` and `scripts/demo-seed/manifest.json` (prod-only data must not enter public repo) |
| `scripts/demo-seed/parse-llm-direct.ts` | Modify | Clerk: add `--model` CLI arg → thread `opts.model` into every `callAi*` call |
| `package.json` | Modify | Add `seed:parse`, `seed:reconcile`, `seed:build`, `seed:validate`, `seed:all` scripts |
| `scripts/demo-seed/reconcile.ts` | Create | Analyst: Opus thread-aware grouping → deterministic anonymization map + conflict flags |
| `scripts/demo-seed/reconcile-cache.ts` | Create | Read/write `.reconcile-cache/<hash>.json` (determinism for the Opus grouping) |
| `scripts/demo-seed/analyze.ts` | Modify | Pass reconcile's anonymization into `seedAnonymization` (param already exists) |
| `scripts/demo-seed/validators.ts` | Create | Schema + sanity validators over a built DB (leak already enforced inside `build.ts`) |
| `scripts/demo-seed/summary.ts` | Create | Deterministic (Opus-free) summary printer: counts, top matches, anonymization preview, conflicts |
| `scripts/demo-seed/seed-all.ts` | Create | Orchestrator: parse → reconcile → analyze → build → validate → summary |
| `scripts/demo-seed/deploy.sh` | Create | scp `demo-seed.db` to prod with `.bak` backup |
| `scripts/demo-seed/__tests__/reconcile.test.ts` | Create | Unit tests for reconcile pure functions |
| `scripts/demo-seed/__tests__/validators.test.ts` | Create | Unit tests for validators |
| `scripts/demo-seed/__tests__/summary.test.ts` | Create | Unit test for summary formatting |

---

## Task 1: Stop tracking prod-only data in git

**Files:**
- Modify: `.gitignore`

**Why:** The repo currently *tracks* `data/demo-seed.db` (via the negation `!/data/demo-seed.db`) and `scripts/demo-seed/manifest.json`. Both will contain real ETM-Services names (manifest holds the real→pseudonym map). Per the design they must be prod-only. The synthetic test fixture `scripts/demo-seed/__tests__/fixtures/manifest.fixture.json` stays tracked (tests need it).

- [ ] **Step 1: Inspect current ignore rules**

Run: `git -C ~/work/qd-opus-seed grep -n "demo-seed" .gitignore; grep -n "manifest" .gitignore`
Expected: shows a line `!/data/demo-seed.db` and confirms `manifest.json` is not yet ignored.

- [ ] **Step 2: Remove the demo-seed.db negation and ignore the real manifest**

In `.gitignore`, delete the line `!/data/demo-seed.db`. Then add (near the other demo-seed ignores):

```gitignore
# Prod-only demo data — never in the public repo
/data/demo-seed.db
/scripts/demo-seed/manifest.json
/scripts/demo-seed/.reconcile-cache/
```

- [ ] **Step 3: Untrack the files already in the index**

Run:
```bash
cd ~/work/qd-opus-seed
git rm --cached --ignore-unmatch data/demo-seed.db scripts/demo-seed/manifest.json
```
Expected: removes them from the index if present (no error if absent).

- [ ] **Step 4: Verify they are now ignored**

Run: `git check-ignore data/demo-seed.db scripts/demo-seed/manifest.json && echo OK`
Expected: prints both paths then `OK`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore(demo-seed): untrack prod-only db + manifest (anonymization map must not enter public repo)"
```

---

## Task 2: Clerk — route per-email parse through Opus 4.8

**Files:**
- Modify: `scripts/demo-seed/parse-llm-direct.ts`
- Modify: `package.json`

**Why:** `parse-llm-direct.ts` already routes to `claude-cli` when `AI_PROVIDER=claude-cli`, but the model defaults to `claude-opus-4-7`. We add a `--model` arg and thread it into every `callAi*` opts so we can run Opus 4.8. No rewrite needed — #650's provider abstraction already does the heavy lifting.

- [ ] **Step 1: Add `model` to the args parser**

In `parse-llm-direct.ts`, locate the `Args` interface and `parseArgs`. Extend them:

```ts
interface Args {
  rawDir: string;
  classifyBatchSize: number;
  model: string;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  return {
    rawDir: path.resolve(get('--raw-dir') ?? DEFAULT_RAW),
    classifyBatchSize: parseInt(get('--batch-size') ?? String(DEFAULT_CLASSIFY_BATCH), 10),
    model: get('--model') ?? 'claude-opus-4-8',
  };
}
```

- [ ] **Step 2: Thread `model` into every callAi* opts**

The parse functions (`classifyBatch`, `parseCargoBatch`, `parseVesselBatch`, `parseRecapBatch`) call `callAiJson`/`callAiText` with an `opts` object containing `timeoutMs` and `responseSchema`. Add `model` to each. To avoid signature churn, read it from a module-level variable set in `main()`:

Add near the top (after the constants):
```ts
let SEED_MODEL = 'claude-opus-4-8';
```
In `main()`, right after `const args = parseArgs(process.argv.slice(2));`, add:
```ts
SEED_MODEL = args.model;
```
Then in EACH `callAiJson`/`callAiText` opts object inside the batch functions, add `model: SEED_MODEL`. Example for `classifyBatch`:
```ts
const result = await callAiJson<{ classifications: AiClassification[] }>(
  'CLASSIFY',
  getClassifyPrompt(),
  `Today's date: ${todayIso}\n\n${JSON.stringify(batch)}`,
  { timeoutMs: LLM_TIMEOUT_MS, responseSchema: CLASSIFY_SCHEMA, model: SEED_MODEL },
);
```
Apply the same `model: SEED_MODEL` addition to the `callAiText('PARSE_CARGO', ...)`, `callAiText('PARSE_VESSEL', ...)`, and `callAiText('PARSE_RECAP', ...)` opts.

- [ ] **Step 3: Add npm scripts**

In `package.json` `scripts`, add:
```json
"seed:parse": "AI_PROVIDER=claude-cli tsx scripts/demo-seed/parse-llm-direct.ts",
"seed:reconcile": "AI_PROVIDER=claude-cli tsx scripts/demo-seed/reconcile.ts",
"seed:build": "tsx scripts/demo-seed/build.ts",
"seed:validate": "tsx scripts/demo-seed/validators.ts",
"seed:all": "AI_PROVIDER=claude-cli tsx scripts/demo-seed/seed-all.ts"
```

- [ ] **Step 4: Type-check the modified script**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep parse-llm-direct || echo "no type errors in parse-llm-direct"`
Expected: `no type errors in parse-llm-direct`.

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/parse-llm-direct.ts package.json
git commit -m "feat(demo-seed): clerk parses via Opus 4.8 (claude-cli, --model arg)"
```

---

## Task 3: Analyst — reconcile pure functions

**Files:**
- Create: `scripts/demo-seed/reconcile.ts`
- Test: `scripts/demo-seed/__tests__/reconcile.test.ts`

**Why:** Opus provides only the *grouping* (which raw name strings refer to the same entity). The CODE assigns pseudonyms deterministically by first-appearance order, so the anonymization map is reproducible even though the model is not. This task builds the pure (no-LLM) parts: collect mentions, build the prompt, parse the grouping → anonymization map.

- [ ] **Step 1: Write the failing test**

Create `scripts/demo-seed/__tests__/reconcile.test.ts`:

```ts
import {
  collectMentions,
  parseReconcileResponse,
  type EntityMention,
} from '../reconcile';
import type { LlmCache } from '../llm-cache';

function emptyCache(): LlmCache {
  return {
    corpusHash: 'h', generatedAt: '2026-05-27T00:00:00.000Z',
    classifications: [], parsedCargos: [], parsedVessels: [], parsedFixtureRecaps: [],
  };
}

describe('collectMentions', () => {
  it('pulls vessel names and recap parties as mentions', () => {
    const cache = emptyCache();
    cache.parsedVessels = [{ emailId: 'e1', itemIndex: 0, vesselName: { value: 'M/V SPRING WIND', confidence: 'confirmed', source_text: 'x' } } as any];
    cache.parsedFixtureRecaps = [{ emailId: 'e2', charterers: { value: 'KORNAS LTD', confidence: 'confirmed', source_text: 'y' }, broker: 'ETM Services' } as any];
    const m = collectMentions(cache);
    expect(m).toEqual(expect.arrayContaining([
      { kind: 'vessel', raw: 'M/V SPRING WIND', emailId: 'e1' },
      { kind: 'charterer', raw: 'KORNAS LTD', emailId: 'e2' },
      { kind: 'broker', raw: 'ETM Services', emailId: 'e2' },
    ]));
  });
});

describe('parseReconcileResponse', () => {
  const mentions: EntityMention[] = [
    { kind: 'vessel', raw: 'M/V SPRING WIND', emailId: 'e1' },
    { kind: 'vessel', raw: 'SPRING WIND', emailId: 'e3' },
    { kind: 'charterer', raw: 'KORNAS LTD', emailId: 'e2' },
  ];
  const opusJson = JSON.stringify({
    groups: [
      { kind: 'vessel', canonical: 'M/V SPRING WIND', aliases: ['M/V SPRING WIND', 'SPRING WIND'] },
      { kind: 'charterer', canonical: 'KORNAS LTD', aliases: ['KORNAS LTD'] },
    ],
    conflicts: [],
  });

  it('assigns deterministic pseudonyms by first-appearance order', () => {
    const r = parseReconcileResponse(opusJson, mentions);
    expect(r.anonymization.vessels['M/V SPRING WIND']).toBe('M/V SEAGULL 1');
    expect(r.anonymization.vessels['SPRING WIND']).toBe('M/V SEAGULL 1');
    expect(r.anonymization.charterers['KORNAS LTD']).toBe('GRAIN TRADER A');
  });

  it('is stable across repeated runs', () => {
    const a = parseReconcileResponse(opusJson, mentions);
    const b = parseReconcileResponse(opusJson, mentions);
    expect(a.anonymization).toEqual(b.anonymization);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/demo-seed/__tests__/reconcile.test.ts`
Expected: FAIL — cannot find module `../reconcile`.

- [ ] **Step 3: Implement `reconcile.ts` pure functions**

Create `scripts/demo-seed/reconcile.ts`:

```ts
// scripts/demo-seed/reconcile.ts
import { cfValue } from '@/lib/types';
import type { LlmCache } from './llm-cache';
import type { Manifest } from './manifest-schema';

export type EntityKind = 'vessel' | 'charterer' | 'broker' | 'sender_email';

export interface EntityMention {
  kind: EntityKind;
  raw: string;
  emailId: string;
}

export interface ReconcileGroup {
  kind: EntityKind;
  canonical: string;
  aliases: string[];
}

export interface ReconcileResult {
  anonymization: Manifest['anonymization'];
  canonical: Record<string, string>; // raw -> canonical
  conflicts: string[];
}

const PSEUDO_PREFIX: Record<EntityKind, (n: number) => string> = {
  vessel: (n) => `M/V SEAGULL ${n}`,
  charterer: (n) => `GRAIN TRADER ${String.fromCharCode(64 + n)}`, // 1 -> A
  broker: (n) => (n === 1 ? 'DEMO BROKER' : `DEMO BROKER ${n}`),
  sender_email: (n) => `broker${n === 1 ? '' : n}@demo.local`,
};

function pushIf(arr: EntityMention[], kind: EntityKind, raw: unknown, emailId: string): void {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v) arr.push({ kind, raw: v, emailId });
}

export function collectMentions(cache: LlmCache): EntityMention[] {
  const out: EntityMention[] = [];
  for (const v of cache.parsedVessels) pushIf(out, 'vessel', cfValue(v.vesselName), v.emailId);
  for (const r of cache.parsedFixtureRecaps) {
    pushIf(out, 'vessel', cfValue(r.vesselName), r.emailId);
    pushIf(out, 'charterer', cfValue(r.charterers), r.emailId);
    pushIf(out, 'charterer', cfValue(r.account), r.emailId);
    pushIf(out, 'broker', r.broker, r.emailId);
  }
  for (const c of cache.classifications) {
    pushIf(out, 'charterer', c.originalSenderCompany, c.emailId);
  }
  return out;
}

export function buildReconcilePrompt(mentions: EntityMention[]): { system: string; user: string } {
  const system = [
    'You are a maritime-data reconciliation assistant.',
    'You are given a list of entity name MENTIONS extracted from many shipping emails.',
    'Group mentions that refer to the SAME real-world entity (same vessel / same company), tolerating spelling, punctuation, and abbreviation differences (e.g. "M/V SPRING WIND" == "SPRING WIND" == "MV SPRINGWIND").',
    'Pick ONE canonical form per group (the most complete real name seen).',
    'Flag a conflict ONLY when the same raw string clearly denotes two different entities in different emails.',
    'Return STRICT JSON: {"groups":[{"kind":"vessel|charterer|broker|sender_email","canonical":"<name>","aliases":["<raw>",...]}],"conflicts":["<human-readable>",...]}.',
    'Every input raw string MUST appear in exactly one group\'s aliases. Do not invent names.',
  ].join('\n');
  const user = JSON.stringify({ mentions });
  return { system, user };
}

export function parseReconcileResponse(raw: string, mentions: EntityMention[]): ReconcileResult {
  const parsed = JSON.parse(raw) as { groups: ReconcileGroup[]; conflicts?: string[] };
  const anonymization: Manifest['anonymization'] = { vessels: {}, charterers: {}, brokers: {}, sender_emails: {} };
  const canonical: Record<string, string> = {};

  // Deterministic order: by first appearance of any alias in the mentions list.
  const firstIdx = (g: ReconcileGroup) =>
    Math.min(...g.aliases.map((a) => {
      const i = mentions.findIndex((m) => m.raw === a);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    }));
  const ordered = [...parsed.groups].sort((a, b) => firstIdx(a) - firstIdx(b));

  const counters: Record<EntityKind, number> = { vessel: 0, charterer: 0, broker: 0, sender_email: 0 };
  const bucket: Record<EntityKind, keyof Manifest['anonymization']> = {
    vessel: 'vessels', charterer: 'charterers', broker: 'brokers', sender_email: 'sender_emails',
  };
  for (const g of ordered) {
    counters[g.kind] += 1;
    const pseudo = PSEUDO_PREFIX[g.kind](counters[g.kind]);
    for (const alias of g.aliases) {
      anonymization[bucket[g.kind]][alias] = pseudo;
      canonical[alias] = g.canonical;
    }
  }
  return { anonymization, canonical, conflicts: parsed.conflicts ?? [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest scripts/demo-seed/__tests__/reconcile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/reconcile.ts scripts/demo-seed/__tests__/reconcile.test.ts
git commit -m "feat(demo-seed): reconcile pure functions — collect mentions + deterministic pseudonyms"
```

---

## Task 4: Analyst — Opus wiring + reconcile cache

**Files:**
- Create: `scripts/demo-seed/reconcile-cache.ts`
- Modify: `scripts/demo-seed/reconcile.ts` (add `reconcile()` entry + `main()`)
- Test: `scripts/demo-seed/__tests__/reconcile.test.ts` (extend)

**Why:** Wrap the pure functions with the Opus call (cached for determinism) and a CLI entry. The cache stores the raw Opus grouping so re-runs are byte-stable.

- [ ] **Step 1: Implement the reconcile cache**

Create `scripts/demo-seed/reconcile-cache.ts`:

```ts
// scripts/demo-seed/reconcile-cache.ts
import * as fs from 'fs';
import * as path from 'path';

const DIR = '.reconcile-cache';

export function reconcileCachePath(rawDir: string, hash: string): string {
  return path.join(rawDir, DIR, `${hash}.json`);
}

export function readReconcileCache(rawDir: string, hash: string): string | null {
  const p = reconcileCachePath(rawDir, hash);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

export function writeReconcileCache(rawDir: string, hash: string, rawJson: string): void {
  const dir = path.join(rawDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(reconcileCachePath(rawDir, hash), rawJson.trimEnd() + '\n');
}
```

- [ ] **Step 2: Add the `reconcile()` entry + `main()` to `reconcile.ts`**

Append to `scripts/demo-seed/reconcile.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { callAiText } from '@/lib/ai-provider';
import { corpusHash, loadLlmCacheIfAny } from './llm-cache';
import { readReconcileCache, writeReconcileCache } from './reconcile-cache';

const DEFAULT_RAW = '.private/raw-emails';
const RECONCILE_TIMEOUT_MS = 120_000;

export async function reconcile(opts: { rawDir: string; model?: string }): Promise<ReconcileResult> {
  const cache = loadLlmCacheIfAny(opts.rawDir);
  if (!cache) throw new Error(`[reconcile] no llm-cache for ${opts.rawDir} — run seed:parse first`);
  const mentions = collectMentions(cache);
  const hash = corpusHash(opts.rawDir);

  let rawJson = readReconcileCache(opts.rawDir, hash);
  if (!rawJson) {
    const { system, user } = buildReconcilePrompt(mentions);
    const text = await callAiText('RECONCILE', system, user, {
      timeoutMs: RECONCILE_TIMEOUT_MS,
      model: opts.model ?? 'claude-opus-4-8',
    });
    // extractJson is applied inside callAiText for claude-cli? No — callAiText returns raw text.
    rawJson = extractJsonLoose(text);
    writeReconcileCache(opts.rawDir, hash, rawJson);
  }
  return parseReconcileResponse(rawJson, mentions);
}

// Minimal JSON extractor (callAiText returns raw model text for claude-cli).
function extractJsonLoose(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('[reconcile] no JSON object in model output');
  return text.slice(start, end + 1);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const rawDir = path.resolve(get('--raw-dir') ?? DEFAULT_RAW);
  const model = get('--model') ?? 'claude-opus-4-8';
  reconcile({ rawDir, model })
    .then((r) => {
      const out = path.join(rawDir, '.reconcile-cache', 'result.json');
      fs.writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
      console.log(`[reconcile] groups → ${Object.keys(r.canonical).length} aliases, ${r.conflicts.length} conflicts. Wrote ${out}`);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Add a cache round-trip test**

Append to `scripts/demo-seed/__tests__/reconcile.test.ts`:

```ts
import { writeReconcileCache, readReconcileCache } from '../reconcile-cache';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('reconcile-cache', () => {
  it('round-trips raw grouping json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
    try {
      writeReconcileCache(dir, 'abc', '{"groups":[],"conflicts":[]}');
      expect(readReconcileCache(dir, 'abc')).toBe('{"groups":[],"conflicts":[]}\n');
      expect(readReconcileCache(dir, 'missing')).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx jest scripts/demo-seed/__tests__/reconcile.test.ts`
Expected: PASS (4 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/reconcile.ts scripts/demo-seed/reconcile-cache.ts scripts/demo-seed/__tests__/reconcile.test.ts
git commit -m "feat(demo-seed): reconcile() Opus wiring + cache (deterministic grouping)"
```

---

## Task 5: Feed reconcile's anonymization into analyze

**Files:**
- Modify: `scripts/demo-seed/analyze.ts`
- Test: `scripts/demo-seed/__tests__/analyze.test.ts` (extend)

**Why:** `analyze()` already accepts `seedAnonymization?: Manifest['anonymization']` and merges it additively. We expose it on the CLI path so the orchestrator can pass reconcile's map; reconcile's curated pseudonyms then take precedence over analyze's heuristic `alias()`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/demo-seed/__tests__/analyze.test.ts`:

```ts
it('honors seedAnonymization passed in', async () => {
  const seeded = { vessels: { 'M/V SPRING WIND': 'M/V SEAGULL 1' }, charterers: {}, brokers: {}, sender_emails: {} };
  const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14, seedAnonymization: seeded });
  expect(m.anonymization.vessels['M/V SPRING WIND']).toBe('M/V SEAGULL 1');
});
```

- [ ] **Step 2: Run to verify it passes or fails**

Run: `npx jest scripts/demo-seed/__tests__/analyze.test.ts -t "honors seedAnonymization"`
Expected: If `analyze` already merges `seedAnonymization` correctly → PASS (no code change needed; keep the test as a regression lock and skip to Step 4). If it FAILS, do Step 3.

- [ ] **Step 3: Ensure seedAnonymization is merged before heuristic aliasing**

In `analyze.ts`, locate where the `anonymization` object is initialized. Ensure it starts from `opts.seedAnonymization` when present:

```ts
const anonymization: Manifest['anonymization'] = {
  vessels: { ...(opts.seedAnonymization?.vessels ?? {}) },
  charterers: { ...(opts.seedAnonymization?.charterers ?? {}) },
  brokers: { ...(opts.seedAnonymization?.brokers ?? {}) },
  sender_emails: { ...(opts.seedAnonymization?.sender_emails ?? {}) },
};
```
And in `alias()`, return the existing mapping if the key is already present (do not overwrite a seeded pseudonym):
```ts
function alias(map: Record<string, string>, raw: string, makePseudo: () => string): string {
  if (map[raw]) return map[raw];
  const p = makePseudo();
  map[raw] = p;
  return p;
}
```

- [ ] **Step 4: Run the full analyze suite**

Run: `npx jest scripts/demo-seed/__tests__/analyze.test.ts`
Expected: PASS (all, including the new test).

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/analyze.ts scripts/demo-seed/__tests__/analyze.test.ts
git commit -m "feat(demo-seed): analyze honors reconcile seedAnonymization (curated pseudonyms win)"
```

---

## Task 6: Validators — schema + sanity over the built DB

**Files:**
- Create: `scripts/demo-seed/validators.ts`
- Test: `scripts/demo-seed/__tests__/validators.test.ts`

**Why:** `build.ts` already throws on anonymization leaks (Task 16, `forbiddenSubstrings`). We add the remaining gates the design requires: schema sanity of `parsed_results` rows, date-window sanity, provider-artifact detection (`{value:'null'}`, `{value:0, source_text:''}`, `vessel_yob:0`), and a minimum active-match count.

- [ ] **Step 1: Write the failing test**

Create `scripts/demo-seed/__tests__/validators.test.ts`:

```ts
import { sanityCheckRows, type SanityIssue } from '../validators';

describe('sanityCheckRows', () => {
  it('flags NULL_STRING / ZERO_NUMERIC / yob=0 artefacts', () => {
    const rows = [
      { gmail_message_id: 'e1', parse_type: 'recap', result_json: JSON.stringify({ vesselName: { value: 'null' } }) },
      { gmail_message_id: 'e2', parse_type: 'vessel', result_json: JSON.stringify({ dwtSummer: { value: 0, source_text: '' } }) },
      { gmail_message_id: 'e3', parse_type: 'recap', result_json: JSON.stringify({ vessel_yob: 0 }) },
    ];
    const issues: SanityIssue[] = sanityCheckRows(rows);
    expect(issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['NULL_STRING', 'ZERO_NUMERIC', 'ZERO_YOB']),
    );
  });

  it('returns no issues for clean rows', () => {
    const rows = [{ gmail_message_id: 'e4', parse_type: 'cargo', result_json: JSON.stringify({ weightMt: { value: 5000, source_text: '5000 mt' } }) }];
    expect(sanityCheckRows(rows)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest scripts/demo-seed/__tests__/validators.test.ts`
Expected: FAIL — cannot find module `../validators`.

- [ ] **Step 3: Implement `validators.ts`**

Create `scripts/demo-seed/validators.ts`:

```ts
// scripts/demo-seed/validators.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export interface SanityIssue {
  kind: 'NULL_STRING' | 'ZERO_NUMERIC' | 'ZERO_YOB' | 'DATE_OUT_OF_WINDOW' | 'LOW_MATCH_COUNT';
  emailId?: string;
  detail: string;
}

interface ParsedRow { gmail_message_id: string; parse_type: string; result_json: string; }

function walk(node: unknown, visit: (v: unknown) => void): void {
  visit(node);
  if (node && typeof node === 'object') {
    for (const val of Object.values(node as Record<string, unknown>)) walk(val, visit);
  }
}

export function sanityCheckRows(rows: ParsedRow[]): SanityIssue[] {
  const issues: SanityIssue[] = [];
  for (const r of rows) {
    let obj: unknown;
    try { obj = JSON.parse(r.result_json); } catch { issues.push({ kind: 'NULL_STRING', emailId: r.gmail_message_id, detail: 'invalid JSON' }); continue; }
    walk(obj, (v) => {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (o.value === 'null') issues.push({ kind: 'NULL_STRING', emailId: r.gmail_message_id, detail: 'value is the string "null"' });
        if (o.value === 0 && o.source_text === '') issues.push({ kind: 'ZERO_NUMERIC', emailId: r.gmail_message_id, detail: 'value 0 with empty source_text' });
        if ('vessel_yob' in o && o.vessel_yob === 0) issues.push({ kind: 'ZERO_YOB', emailId: r.gmail_message_id, detail: 'vessel_yob is 0' });
      }
    });
  }
  return issues;
}

export interface ValidateResult { ok: boolean; issues: SanityIssue[]; matchCount: number; }

export function validateDb(dbPath: string, opts: { minMatches?: number } = {}): ValidateResult {
  const db = new Database(dbPath, { readonly: true });
  sqliteVec.load(db);
  try {
    const rows = db.prepare('SELECT gmail_message_id, parse_type, result_json FROM parsed_results').all() as ParsedRow[];
    const issues = sanityCheckRows(rows);
    const { c: matchCount } = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status = 'shortlist'").get() as { c: number };
    const minMatches = opts.minMatches ?? 120;
    if (matchCount < minMatches) issues.push({ kind: 'LOW_MATCH_COUNT', detail: `${matchCount} active matches < ${minMatches}` });
    return { ok: issues.length === 0, issues, matchCount };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const dbPath = get('--db') ?? 'data/demo-seed.db';
  const res = validateDb(dbPath);
  for (const i of res.issues) console.error(`[validate] ${i.kind} ${i.emailId ?? ''} — ${i.detail}`);
  console.log(`[validate] matches=${res.matchCount} issues=${res.issues.length} ok=${res.ok}`);
  if (!res.ok) process.exit(1);
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest scripts/demo-seed/__tests__/validators.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/validators.ts scripts/demo-seed/__tests__/validators.test.ts
git commit -m "feat(demo-seed): DB validators — schema/sanity/artefact + min-match gate"
```

---

## Task 7: Summary printer (Opus-free, deterministic)

**Files:**
- Create: `scripts/demo-seed/summary.ts`
- Test: `scripts/demo-seed/__tests__/summary.test.ts`

**Why:** Founder eyeball-review before deploy. The summary is purely derived from the manifest + DB counts — no LLM call needed, so it is deterministic and CI-testable.

- [ ] **Step 1: Write the failing test**

Create `scripts/demo-seed/__tests__/summary.test.ts`:

```ts
import { formatSummary, type SummaryInput } from '../summary';

describe('formatSummary', () => {
  it('renders counts, conflicts and anonymization preview', () => {
    const input: SummaryInput = {
      counts: { cargo: 80, vessel: 60, recap: 13, classify: 153 },
      matchCount: 142,
      anonymization: { vessels: { 'M/V SPRING WIND': 'M/V SEAGULL 1' }, charterers: {}, brokers: {}, sender_emails: {} },
      conflicts: ['e7: two vessels named SERKAN'],
    };
    const out = formatSummary(input);
    expect(out).toContain('cargo=80');
    expect(out).toContain('matches=142');
    expect(out).toContain('M/V SPRING WIND → M/V SEAGULL 1');
    expect(out).toContain('two vessels named SERKAN');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest scripts/demo-seed/__tests__/summary.test.ts`
Expected: FAIL — cannot find module `../summary`.

- [ ] **Step 3: Implement `summary.ts`**

Create `scripts/demo-seed/summary.ts`:

```ts
// scripts/demo-seed/summary.ts
import type { Manifest } from './manifest-schema';

export interface SummaryInput {
  counts: { cargo: number; vessel: number; recap: number; classify: number };
  matchCount: number;
  anonymization: Manifest['anonymization'];
  conflicts: string[];
}

export function formatSummary(input: SummaryInput): string {
  const { counts, matchCount, anonymization, conflicts } = input;
  const lines: string[] = [];
  lines.push('=== Demo seed summary ===');
  lines.push(`parsed: classify=${counts.classify} cargo=${counts.cargo} vessel=${counts.vessel} recap=${counts.recap}`);
  lines.push(`matches=${matchCount} (shortlist)`);
  const anonCount = Object.values(anonymization).reduce((n, m) => n + Object.keys(m).length, 0);
  lines.push(`anonymization: ${anonCount} aliases`);
  for (const [kind, map] of Object.entries(anonymization)) {
    for (const [real, pseudo] of Object.entries(map).slice(0, 5)) lines.push(`  [${kind}] ${real} → ${pseudo}`);
  }
  lines.push(`conflicts: ${conflicts.length}`);
  for (const c of conflicts) lines.push(`  ! ${c}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest scripts/demo-seed/__tests__/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/summary.ts scripts/demo-seed/__tests__/summary.test.ts
git commit -m "feat(demo-seed): deterministic seed summary printer"
```

---

## Task 8: Orchestrator — seed-all

**Files:**
- Create: `scripts/demo-seed/seed-all.ts`

**Why:** One command runs the full pipeline locally: parse (Opus) → reconcile (Opus) → analyze → build → validate → summary. Parse/reconcile reuse their caches, so re-runs are fast and deterministic.

- [ ] **Step 1: Implement `seed-all.ts`**

Create `scripts/demo-seed/seed-all.ts`:

```ts
// scripts/demo-seed/seed-all.ts
// Run with: AI_PROVIDER=claude-cli npx tsx scripts/demo-seed/seed-all.ts [--frozen-date YYYY-MM-DD] [--model claude-opus-4-8]
import * as path from 'path';
import Database from 'better-sqlite3';
import { spawnSync } from 'child_process';
import { reconcile } from './reconcile';
import { analyze } from './analyze';
import { build } from './build';
import { validateDb } from './validators';
import { formatSummary } from './summary';
import { loadLlmCacheIfAny } from './llm-cache';

const argv = process.argv.slice(2);
const get = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };

async function main(): Promise<void> {
  const rawDir = path.resolve(get('--raw-dir') ?? '.private/raw-emails');
  const frozenDate = get('--frozen-date') ?? new Date().toISOString().slice(0, 10);
  const model = get('--model') ?? 'claude-opus-4-8';
  const manifestPath = path.resolve('scripts/demo-seed/manifest.json');
  const outDb = path.resolve('data/demo-seed.db');

  // 1. Clerk (separate process so AI_PROVIDER env is unambiguous)
  console.log('[seed-all] 1/5 parse (Opus clerk)…');
  const parse = spawnSync('npx', ['tsx', 'scripts/demo-seed/parse-llm-direct.ts', '--raw-dir', rawDir, '--model', model],
    { stdio: 'inherit', env: { ...process.env, AI_PROVIDER: 'claude-cli' } });
  if (parse.status !== 0) throw new Error('parse step failed');

  // 2. Analyst
  console.log('[seed-all] 2/5 reconcile (Opus analyst)…');
  const rec = await reconcile({ rawDir, model });

  // 3. Analyze (offsets + merge reconcile anonymization)
  console.log('[seed-all] 3/5 analyze (date offsets)…');
  const manifest = await analyze({ rawDir, frozenDate, demoWindowDays: 14, seedAnonymization: rec.anonymization });
  require('fs').writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // 4. Build
  console.log('[seed-all] 4/5 build…');
  const forbidden = [
    ...Object.keys(rec.anonymization.vessels),
    ...Object.keys(rec.anonymization.charterers),
    ...Object.keys(rec.anonymization.brokers),
    ...Object.keys(rec.anonymization.sender_emails),
    'etm-services.net', 'ETM Services',
  ].filter((s) => s.length >= 3);
  await build({ rawDir, manifestPath, outDb, forbiddenSubstrings: forbidden });

  // 5. Validate + summary
  console.log('[seed-all] 5/5 validate…');
  const res = validateDb(outDb);
  const cache = loadLlmCacheIfAny(rawDir)!;
  const db = new Database(outDb, { readonly: true });
  require('sqlite-vec').load(db);
  const matchCount = (db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='shortlist'").get() as { c: number }).c;
  db.close();
  console.log(formatSummary({
    counts: { cargo: cache.parsedCargos.length, vessel: cache.parsedVessels.length, recap: cache.parsedFixtureRecaps.length, classify: cache.classifications.length },
    matchCount, anonymization: rec.anonymization, conflicts: rec.conflicts,
  }));
  if (!res.ok) { console.error('[seed-all] VALIDATION FAILED — see issues above'); process.exit(1); }
  console.log('[seed-all] OK — review summary, then `bash scripts/demo-seed/deploy.sh` to ship to prod');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep seed-all || echo "no type errors in seed-all"`
Expected: `no type errors in seed-all`.

- [ ] **Step 3: Commit**

```bash
git add scripts/demo-seed/seed-all.ts
git commit -m "feat(demo-seed): seed-all orchestrator (parse→reconcile→analyze→build→validate)"
```

---

## Task 9: Deploy script

**Files:**
- Create: `scripts/demo-seed/deploy.sh`

**Why:** Ship the prod-only DB to the demo server with a backup. Prod = outreach-vps (demo.quantika.org). The exact host/path is parameterized via env so no secrets live in the repo.

- [ ] **Step 1: Implement `deploy.sh`**

Create `scripts/demo-seed/deploy.sh`:

```bash
#!/usr/bin/env bash
# Ship the prod-only demo DB. Configure target via env:
#   DEMO_SSH_HOST   (e.g. outreach-vps)
#   DEMO_DB_REMOTE  (e.g. /root/quantika-demo/data/demo-seed.db)
set -euo pipefail

LOCAL_DB="${1:-data/demo-seed.db}"
: "${DEMO_SSH_HOST:?set DEMO_SSH_HOST}"
: "${DEMO_DB_REMOTE:?set DEMO_DB_REMOTE}"

if [[ ! -f "$LOCAL_DB" ]]; then echo "missing $LOCAL_DB — run npm run seed:all first" >&2; exit 1; fi

echo "[deploy] backing up remote db…"
ssh "$DEMO_SSH_HOST" "test -f '$DEMO_DB_REMOTE' && cp '$DEMO_DB_REMOTE' '$DEMO_DB_REMOTE.bak' || true"

echo "[deploy] copying $LOCAL_DB → $DEMO_SSH_HOST:$DEMO_DB_REMOTE"
scp "$LOCAL_DB" "$DEMO_SSH_HOST:$DEMO_DB_REMOTE"

echo "[deploy] done. Ensure prod env has DEMO_MODE=true and SESSIONS_DB_PATH=$DEMO_DB_REMOTE, then restart the app."
```

- [ ] **Step 2: Make it executable + smoke the arg-guard**

Run:
```bash
chmod +x scripts/demo-seed/deploy.sh
bash scripts/demo-seed/deploy.sh /nonexistent.db 2>&1 || echo "guard works"
```
Expected: prints `missing /nonexistent.db …` then `guard works` (the missing-file branch fires before any ssh).

- [ ] **Step 3: Commit**

```bash
git add scripts/demo-seed/deploy.sh
git commit -m "feat(demo-seed): deploy.sh — ship prod-only db with backup"
```

---

## Task 10 (OPTIONAL): Pre-compute matches via the real Opus match engine

**Files:**
- Modify: `scripts/demo-seed/build.ts`

**Why:** Open question from the spec. `build.ts` currently uses an inline heuristic (base score 75). For "whole demo by one hand," wire `computeAndPersistMatches` with a `claude-cli` scorer so matches are Opus-scored with real TCE/freight. Skip this task if the heuristic matches are good enough in the summary review.

- [ ] **Step 1: Decide from the summary**

After Task 8 runs, inspect `matches` quality. If the heuristic produces ≥120 plausible shortlist matches, STOP — do not implement this task (YAGNI). Only proceed if matches look wrong/sparse.

- [ ] **Step 2: Replace the inline pairing with the engine**

In `build.ts`, where the inline `matches` INSERT loop lives (the lines reading `parse_type='cargo'`/`'vessel'`), replace with:

```ts
import { computeAndPersistMatches } from '@/lib/matching/compute-matches';
// …after parsed_results are inserted, before demo_seed_meta:
const cargos = /* shiftedCargos already in scope */;
const vessels = /* shiftedVessels already in scope */;
process.env.MATCH_PROVIDER = 'claude-cli';
await computeAndPersistMatches(cargos, vessels, 'demo-seed', db);
```
Note: `computeAndPersistMatches` is async and calls `callAiJson('MATCH', …)` — it needs `AI_PROVIDER`/`MATCH_PROVIDER=claude-cli` and a model; set `MATCH_MODEL=claude-opus-4-8` in the env when running `seed:all`.

- [ ] **Step 3: Re-run seed-all and confirm match count**

Run: `AI_PROVIDER=claude-cli MATCH_PROVIDER=claude-cli MATCH_MODEL=claude-opus-4-8 npx tsx scripts/demo-seed/seed-all.ts --frozen-date 2026-05-20`
Expected: summary shows `matches=` ≥120 and validator `ok=true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-seed/build.ts
git commit -m "feat(demo-seed): pre-compute matches via Opus match engine (optional)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Clerk (Opus per-email) → Task 2 ✓
- Analyst (reconcile, cross-email names, anonymization map, conflicts) → Tasks 3-4 ✓
- Date-shift consumes reconcile → Task 5 ✓
- Build (shift + anonymize) → existing, exercised by Tasks 5/8 ✓
- Leak detector (hard gate) → existing in `build.ts` (`forbiddenSubstrings`), wired in Task 8 ✓
- Schema + sanity validators → Task 6 ✓
- Opus-free summary → Task 7 ✓
- Prod-only (no git) → Task 1 (gitignore) + Task 9 (deploy) ✓
- Reproducibility via cache → `.llm-cache` (existing) + `.reconcile-cache` (Task 4) ✓
- CI without Opus → all tests use fixtures/mocked grouping; no test calls the live model ✓
- Match precompute (Opus, open question) → Task 10 optional ✓

**Placeholder scan:** No TBD/TODO; every code step shows real code. Task 5 Step 2 has a conditional (pass if already merged) — acceptable, both branches are spelled out.

**Type consistency:** `EntityMention`/`ReconcileResult`/`ReconcileGroup` consistent across Tasks 3-4-8; `Manifest['anonymization']` shape matches `manifest-schema.ts` (`vessels/charterers/brokers/sender_emails`); `SanityIssue` consistent Task 6↔tests; `SummaryInput` consistent Task 7↔8.

**Known deviation from spec:** Spec said "rewrite `parse-llm-direct.ts` → `opus-parse.ts`." Reality: #650's provider abstraction already routes to claude-cli, so the clerk is a small `--model` change in place (Task 2), not a rewrite/rename. Surgical > churn.
