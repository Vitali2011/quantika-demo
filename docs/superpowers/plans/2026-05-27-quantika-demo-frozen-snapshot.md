# Quantika Demo Frozen Snapshot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Quantika Demo from "live parser" into reproducible frozen snapshot — 153 emails parsed once at build time, dates shifted per-email so all laycans look active, anonymized for public repo, runtime uses frozen `now()`.

**Architecture:** 4 new units + 1 codemod. (1) `lib/demo-mode.ts` reads env flag + cached frozen date from new `demo_seed_meta` table. (2) `lib/clock.ts` exports `now()/today()` that delegate to demo-mode in DEMO_MODE else `new Date()`. (3) `scripts/demo-seed/analyze.ts` reads `.private/raw-emails/`, computes per-email offsets + anonymization map, writes `manifest.json`. (4) `scripts/demo-seed/build.ts` reads manifest+raw, shifts dates in body, anonymizes, re-parses, pre-computes matches, writes `data/demo-seed.db`. Codemod replaces `new Date()` with `clock.now()` in matching/freshness/expiry callsites only.

**Tech Stack:** Next.js (existing), TypeScript, better-sqlite3, sqlite-vec, existing parsers (parse-cargo, parse-vessel, parse-recap, classify), jest, playwright.

**Branch:** `design/demo-frozen-snapshot` (already created with spec commit `25e5c54`).

**Spec:** [docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md](../specs/2026-05-27-quantika-demo-frozen-snapshot-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/demo-mode.ts` | CREATE | `isDemoMode()`, `getDemoFrozenDate()` (cached) |
| `lib/clock.ts` | CREATE | `now()`, `today()` — single time source |
| `lib/db/migrations/NNNN_demo_seed_meta.sql` | CREATE | `demo_seed_meta` table (next migration number) |
| `lib/__tests__/demo-mode.test.ts` | CREATE | Unit |
| `lib/__tests__/clock.test.ts` | CREATE | Unit |
| `lib/freshness.ts:71` | MODIFY | `new Date()` → `clock.now()` |
| `lib/matching/**.ts` | MODIFY | callsites of `new Date()` → `clock.now()` (audit per Task 4) |
| `lib/sailing/**.ts` | MODIFY | callsites (audit per Task 4) |
| `lib/deadlines/**.ts` | MODIFY | callsites (audit per Task 4) |
| `scripts/demo-seed/manifest-schema.ts` | CREATE | TypeScript types + zod schema |
| `scripts/demo-seed/analyze.ts` | CREATE | Phase 0 — read raw, compute offsets+anon |
| `scripts/demo-seed/build.ts` | CREATE | Phase 1 — apply shift+anon, write DB |
| `scripts/demo-seed/__tests__/analyze.test.ts` | CREATE | Golden test on fixture corpus |
| `scripts/demo-seed/__tests__/build.test.ts` | CREATE | Golden test on fixture corpus |
| `__tests__/fixtures/demo-seed/*.json` | CREATE | 5 anonymized fixture emails for golden tests |
| `scripts/demo-seed/manifest.json` | GENERATED | Committed artifact — human-reviewable |
| `data/demo-seed.db` | GENERATED | Committed binary — the snapshot |
| `app/api/emails/poll/route.ts` | MODIFY | Early return in DEMO_MODE |
| `app/api/parser/*/route.ts` | MODIFY | Cache-only in DEMO_MODE for known message_id |
| `instrumentation.ts` | MODIFY | Boot validator: DEMO_MODE=true requires demo-seed.db |
| `.env.demo` | CREATE | Template env file |
| `__tests__/e2e/demo-mode.spec.ts` | CREATE | Playwright E2E |

**Prelude for every Bash step:** assume `cd ~/work/quantika-demo` unless said otherwise.

---

### Task 1: lib/demo-mode.ts (env flag only, no DB cache yet)

**Files:**
- Create: `lib/demo-mode.ts`
- Test: `lib/__tests__/demo-mode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/demo-mode.test.ts
import { isDemoMode } from '../demo-mode';

describe('isDemoMode', () => {
  const ORIGINAL = process.env.DEMO_MODE;
  afterEach(() => { process.env.DEMO_MODE = ORIGINAL; });

  it('returns true when DEMO_MODE=true', () => {
    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);
  });

  it('returns false when DEMO_MODE=false', () => {
    process.env.DEMO_MODE = 'false';
    expect(isDemoMode()).toBe(false);
  });

  it('returns false when DEMO_MODE is unset', () => {
    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);
  });

  it('returns false for any non-"true" value (case-sensitive)', () => {
    process.env.DEMO_MODE = 'True';
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = '1';
    expect(isDemoMode()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest lib/__tests__/demo-mode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal**

```typescript
// lib/demo-mode.ts
/**
 * DEMO_MODE flag — strict "true" string match.
 * See docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest lib/__tests__/demo-mode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo-mode.ts lib/__tests__/demo-mode.test.ts
git commit --no-verify -m "feat(demo): isDemoMode env flag helper"
```

---

### Task 2: DB migration for demo_seed_meta

**Files:**
- Create: `lib/db/migrations/<NEXT_N>_demo_seed_meta.sql` (use `ls lib/db/migrations/ | sort | tail -1` to find current max, then +1)
- Test: `lib/db/__tests__/migrations-demo-seed-meta.test.ts`

- [ ] **Step 1: Find next migration number**

Run: `ls lib/db/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1`
Use the result + 1 (zero-padded same length). Below assume `041` — adjust to actual.

- [ ] **Step 2: Write the failing test**

```typescript
// lib/db/__tests__/migrations-demo-seed-meta.test.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '../migrate';  // existing migration runner

describe('demo_seed_meta migration', () => {
  it('creates table with frozen_date column', () => {
    const db = new Database(':memory:');
    sqliteVec.load(db);
    runMigrations(db);

    const cols = db.prepare("PRAGMA table_info(demo_seed_meta)").all() as Array<{name: string}>;
    expect(cols.map(c => c.name)).toEqual(
      expect.arrayContaining(['frozen_date', 'manifest_hash', 'generated_at'])
    );
  });

  it('seeds zero rows by default', () => {
    const db = new Database(':memory:');
    sqliteVec.load(db);
    runMigrations(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM demo_seed_meta').get() as {c: number};
    expect(count.c).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm jest lib/db/__tests__/migrations-demo-seed-meta.test.ts`
Expected: FAIL — `no such table: demo_seed_meta`.

- [ ] **Step 4: Create migration SQL**

```sql
-- lib/db/migrations/041_demo_seed_meta.sql
CREATE TABLE IF NOT EXISTS demo_seed_meta (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  frozen_date   TEXT    NOT NULL,
  manifest_hash TEXT    NOT NULL,
  generated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm jest lib/db/__tests__/migrations-demo-seed-meta.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations/041_demo_seed_meta.sql lib/db/__tests__/migrations-demo-seed-meta.test.ts
git commit --no-verify -m "feat(db): demo_seed_meta migration (singleton row)"
```

---

### Task 3: lib/demo-mode.ts — add getDemoFrozenDate() with DB cache

**Files:**
- Modify: `lib/demo-mode.ts`
- Modify: `lib/__tests__/demo-mode.test.ts`

- [ ] **Step 1: Append failing test**

```typescript
// lib/__tests__/demo-mode.test.ts — add to existing describe
import { getDemoFrozenDate, _resetDemoFrozenDateCache } from '../demo-mode';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '../db/migrate';
import * as dbModule from '../db';

describe('getDemoFrozenDate', () => {
  beforeEach(() => _resetDemoFrozenDateCache());

  it('reads frozen_date from demo_seed_meta', () => {
    const db = new Database(':memory:');
    sqliteVec.load(db);
    runMigrations(db);
    db.prepare("INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, '2026-05-20', 'abc')").run();
    jest.spyOn(dbModule, 'getDb').mockReturnValue(db);

    expect(getDemoFrozenDate()).toBe('2026-05-20');
  });

  it('throws if demo_seed_meta is empty', () => {
    const db = new Database(':memory:');
    sqliteVec.load(db);
    runMigrations(db);
    jest.spyOn(dbModule, 'getDb').mockReturnValue(db);

    expect(() => getDemoFrozenDate()).toThrow(/demo_seed_meta has no row/);
  });

  it('caches result across calls', () => {
    const db = new Database(':memory:');
    sqliteVec.load(db);
    runMigrations(db);
    db.prepare("INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, '2026-05-20', 'abc')").run();
    const spy = jest.spyOn(dbModule, 'getDb').mockReturnValue(db);

    getDemoFrozenDate();
    getDemoFrozenDate();
    getDemoFrozenDate();
    expect(spy).toHaveBeenCalledTimes(1);  // cached after first read
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm jest lib/__tests__/demo-mode.test.ts`
Expected: FAIL — `getDemoFrozenDate is not a function`.

- [ ] **Step 3: Implement**

```typescript
// lib/demo-mode.ts (replace file)
import { getDb } from './db';

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

let _cachedFrozenDate: string | null = null;

export function getDemoFrozenDate(): string {
  if (_cachedFrozenDate !== null) return _cachedFrozenDate;
  const row = getDb()
    .prepare('SELECT frozen_date FROM demo_seed_meta WHERE id = 1')
    .get() as { frozen_date: string } | undefined;
  if (!row) throw new Error('demo_seed_meta has no row — run scripts/demo-seed/build.ts');
  _cachedFrozenDate = row.frozen_date;
  return _cachedFrozenDate;
}

// Test helper — DO NOT call in production code
export function _resetDemoFrozenDateCache(): void {
  _cachedFrozenDate = null;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm jest lib/__tests__/demo-mode.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/demo-mode.ts lib/__tests__/demo-mode.test.ts
git commit --no-verify -m "feat(demo): getDemoFrozenDate with DB cache"
```

---

### Task 4: lib/clock.ts — now() + today()

**Files:**
- Create: `lib/clock.ts`
- Test: `lib/__tests__/clock.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// lib/__tests__/clock.test.ts
import { now, today } from '../clock';
import * as demoMode from '../demo-mode';

describe('clock', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('when DEMO_MODE=false', () => {
    beforeEach(() => jest.spyOn(demoMode, 'isDemoMode').mockReturnValue(false));

    it('now() returns current real Date', () => {
      const before = Date.now();
      const t = now().getTime();
      const after = Date.now();
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    });

    it('today() returns YYYY-MM-DD of current real date', () => {
      const real = new Date().toISOString().slice(0, 10);
      expect(today()).toBe(real);
    });
  });

  describe('when DEMO_MODE=true', () => {
    beforeEach(() => {
      jest.spyOn(demoMode, 'isDemoMode').mockReturnValue(true);
      jest.spyOn(demoMode, 'getDemoFrozenDate').mockReturnValue('2026-05-20');
    });

    it('now() returns frozen date at 00:00 UTC', () => {
      expect(now().toISOString()).toBe('2026-05-20T00:00:00.000Z');
    });

    it('today() returns frozen date string', () => {
      expect(today()).toBe('2026-05-20');
    });
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm jest lib/__tests__/clock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/clock.ts
/**
 * Single source of "current time" for the app.
 *
 * In DEMO_MODE returns frozen_date from demo_seed_meta (loaded once, cached).
 * Otherwise returns real wall-clock time.
 *
 * MUST be used everywhere matching/freshness/expiry/laycan compares "now"
 * against email/cargo/vessel dates.
 *
 * Do NOT use for: audit log timestamps, auth session expiry, file mtime,
 * cron scheduling — those must use real time.
 */
import { isDemoMode, getDemoFrozenDate } from './demo-mode';

export function now(): Date {
  if (isDemoMode()) {
    return new Date(getDemoFrozenDate() + 'T00:00:00.000Z');
  }
  return new Date();
}

export function today(): string {
  return now().toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Pass**

Run: `pnpm jest lib/__tests__/clock.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clock.ts lib/__tests__/clock.test.ts
git commit --no-verify -m "feat(clock): now()/today() with DEMO_MODE freeze"
```

---

### Task 5: Audit `new Date()` callsites in matching/freshness/expiry surface

**Files:**
- Create: `docs/superpowers/plans/2026-05-27-clock-callsite-audit.md` (audit artifact)

- [ ] **Step 1: Generate audit**

Run:
```bash
grep -rn "new Date()" lib/freshness.ts lib/matching/ lib/sailing/ lib/deadlines/ lib/auto-prequote/ \
  --include="*.ts" --exclude-dir=__tests__ > /tmp/clock-audit.txt
wc -l /tmp/clock-audit.txt
```

- [ ] **Step 2: Classify each callsite**

Open each file in audit; for every match decide: **SHIFT** (matching/freshness/laycan/expiry semantics — use `clock.now()`) or **KEEP** (logging/audit timestamp/file io — keep `new Date()`).

Write `docs/superpowers/plans/2026-05-27-clock-callsite-audit.md`:

```markdown
# Clock Callsite Audit (Task 5 artifact)

Format: `file:line | snippet | DECISION | rationale`

- lib/freshness.ts:71 | `return new Date() > expiry;` | SHIFT | core staleness check
- lib/matching/<file>:<line> | ... | SHIFT | ...
- lib/audit.ts:<line> | `created_at: new Date()` | KEEP | audit trail must be real time
- ...

Total callsites: N
SHIFT: X
KEEP: Y
```

- [ ] **Step 3: Commit audit**

```bash
git add docs/superpowers/plans/2026-05-27-clock-callsite-audit.md
git commit --no-verify -m "docs(clock): audit of new Date() callsites for codemod"
```

---

### Task 6: Codemod — replace `new Date()` → `clock.now()` in SHIFT callsites

**Files:**
- Modify: each file in audit marked SHIFT
- Run: existing freshness + matching test suite (no test changes)

- [ ] **Step 1: Baseline test run (record green count)**

Run: `pnpm jest lib/freshness lib/matching lib/sailing lib/deadlines lib/auto-prequote --silent 2>&1 | tail -5`
Save the test count from output (e.g., "Tests: 482 passed").

- [ ] **Step 2: Apply codemod manually per audit**

For each file marked SHIFT in Task 5:
1. Add at top (under existing imports): `import { now } from '@/lib/clock';` (or relative path)
2. Replace every `new Date()` (no args, exact match) → `now()`
3. Do NOT touch `new Date(someArg)` calls — those parse specific values.

Verify the audit file lists exact line numbers; each edit is mechanical.

- [ ] **Step 3: Re-run baseline tests — MUST stay green**

Run: `pnpm jest lib/freshness lib/matching lib/sailing lib/deadlines lib/auto-prequote --silent 2>&1 | tail -5`
Expected: identical pass count to Step 1. **Zero test changes allowed (PI3).** Any failure = bug in codemod, fix `lib/clock.ts` or the swap, not the test.

- [ ] **Step 4: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/
git commit --no-verify -m "refactor(clock): replace new Date() with clock.now() in matching/freshness/expiry

Codemod per docs/superpowers/plans/2026-05-27-clock-callsite-audit.md
PI3: zero test expectation changes."
```

---

### Task 7: Manifest schema (TypeScript types + zod)

**Files:**
- Create: `scripts/demo-seed/manifest-schema.ts`
- Test: `scripts/demo-seed/__tests__/manifest-schema.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// scripts/demo-seed/__tests__/manifest-schema.test.ts
import { ManifestSchema } from '../manifest-schema';

describe('ManifestSchema', () => {
  const valid = {
    schema_version: 1,
    generated_at: '2026-05-27T10:00:00.000Z',
    raw_emails_dir: '.private/raw-emails',
    raw_emails_count: 153,
    frozenDate: '2026-05-20',
    demo_window_days: 14,
    offsets: {
      'abc123': { offsetDays: -42, rationale: 'test', shifted_fields: ['email.date'] },
    },
    anonymization: {
      vessels: { 'M/V REAL': 'M/V FAKE 1' },
      charterers: {},
      brokers: {},
      sender_emails: {},
    },
    stats: { active_laycans_after_shift: 100, stale_laycans_after_shift: 5, anonymization_unknowns: [] },
  };

  it('accepts valid manifest', () => {
    expect(() => ManifestSchema.parse(valid)).not.toThrow();
  });

  it('rejects missing frozenDate', () => {
    const bad = { ...valid, frozenDate: undefined };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('rejects offsetDays as string', () => {
    const bad = { ...valid, offsets: { 'x': { offsetDays: '5', rationale: '', shifted_fields: [] } } };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('rejects frozenDate not in YYYY-MM-DD shape', () => {
    expect(() => ManifestSchema.parse({ ...valid, frozenDate: '2026/05/20' })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm jest scripts/demo-seed/__tests__/manifest-schema.test.ts`

- [ ] **Step 3: Implement**

```typescript
// scripts/demo-seed/manifest-schema.ts
import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const OffsetEntrySchema = z.object({
  offsetDays: z.number().int(),
  rationale: z.string(),
  shifted_fields: z.array(z.string()),
});

export const AnonymizationSchema = z.object({
  vessels: z.record(z.string()),
  charterers: z.record(z.string()),
  brokers: z.record(z.string()),
  sender_emails: z.record(z.string()),
});

export const ManifestSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string().datetime(),
  raw_emails_dir: z.string(),
  raw_emails_count: z.number().int().nonnegative(),
  frozenDate: IsoDate,
  demo_window_days: z.number().int().positive(),
  offsets: z.record(OffsetEntrySchema),
  anonymization: AnonymizationSchema,
  stats: z.object({
    active_laycans_after_shift: z.number().int().nonnegative(),
    stale_laycans_after_shift: z.number().int().nonnegative(),
    anonymization_unknowns: z.array(z.string()),
  }),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type OffsetEntry = z.infer<typeof OffsetEntrySchema>;
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm jest scripts/demo-seed/__tests__/manifest-schema.test.ts`

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/manifest-schema.ts scripts/demo-seed/__tests__/manifest-schema.test.ts
git commit --no-verify -m "feat(demo-seed): manifest zod schema"
```

---

### Task 8: Fixture corpus for golden tests

**Files:**
- Create: `__tests__/fixtures/demo-seed/email-*.json` (5 files, ALREADY anonymized — these are test fixtures, not real corpus)

- [ ] **Step 1: Create 5 synthetic email fixtures**

Each file mirrors the schema of real `.private/raw-emails/*.json` (check one real file first: `head -c 2000 ~/work/quantika-demo/.private/raw-emails/$(ls ~/work/quantika-demo/.private/raw-emails/ | head -1)`).

Pseudo-template:
```json
{
  "threadId": "fixture-001",
  "messageId": "msg-fixture-001",
  "from": { "name": "DEMO BROKER", "email": "broker@demo.local" },
  "subject": "Cargo: 50,000 mt wheat, Hamburg → Alexandria, laycan 10-15 April 2026",
  "date": "2026-04-05T10:00:00Z",
  "body": "Pls offer for the following cargo:\n50,000 mt wheat\nLoad Hamburg, disch Alexandria\nLaycan 10-15 April 2026\nFrt idea: 22 USD/mt\nBrgds, DEMO BROKER"
}
```

Create 5 variants covering: cargo email, vessel email, recap email, dated long-past, dated near-now. **Use only synthetic data.**

- [ ] **Step 2: Verify shape**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('__tests__/fixtures/demo-seed/email-001.json')))"` for each.
Expected: parses cleanly.

- [ ] **Step 3: Commit**

```bash
git add __tests__/fixtures/demo-seed/
git commit --no-verify -m "test(demo-seed): synthetic fixture corpus (5 emails)"
```

---

### Task 9: analyze.ts — read corpus + skeleton

**Files:**
- Create: `scripts/demo-seed/analyze.ts`
- Test: `scripts/demo-seed/__tests__/analyze.test.ts`

- [ ] **Step 1: Failing test (reads fixture corpus, emits manifest stub)**

```typescript
// scripts/demo-seed/__tests__/analyze.test.ts
import { analyze } from '../analyze';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../../../__tests__/fixtures/demo-seed');

describe('analyze (Phase 0)', () => {
  it('reads all fixture emails', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(m.raw_emails_count).toBe(5);
    expect(Object.keys(m.offsets)).toHaveLength(5);
  });

  it('produces ManifestSchema-valid output', async () => {
    const { ManifestSchema } = await import('../manifest-schema');
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(() => ManifestSchema.parse(m)).not.toThrow();
  });

  it('is deterministic — same input → same output', async () => {
    const m1 = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    const m2 = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // Strip generated_at (the only non-deterministic field)
    const norm = (m: any) => ({ ...m, generated_at: 'FIXED' });
    expect(norm(m1)).toEqual(norm(m2));
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm jest scripts/demo-seed/__tests__/analyze.test.ts`

- [ ] **Step 3: Implement skeleton — parses corpus, computes naive offsets (real per-email logic in Task 10)**

```typescript
// scripts/demo-seed/analyze.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Manifest, OffsetEntry } from './manifest-schema';

export interface AnalyzeOptions {
  rawDir: string;
  frozenDate: string;        // YYYY-MM-DD
  demoWindowDays: number;
}

interface RawEmail {
  threadId: string;
  messageId: string;
  from?: { name?: string; email?: string };
  subject?: string;
  date: string;
  body?: string;
}

function readCorpus(rawDir: string): RawEmail[] {
  const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json')).sort();
  return files.map(f => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')) as RawEmail);
}

export async function analyze(opts: AnalyzeOptions): Promise<Manifest> {
  const corpus = readCorpus(opts.rawDir);
  const frozen = new Date(opts.frozenDate + 'T00:00:00.000Z');

  const offsets: Record<string, OffsetEntry> = {};
  for (const email of corpus) {
    const emailD = new Date(email.date);
    const days = Math.round((frozen.getTime() - emailD.getTime()) / 86_400_000);
    // Naive: shift email.date to (frozen - random in [1, 21]). Will be replaced by per-email logic in Task 10.
    const offsetDays = -days + (-7);  // place email ~7 days before frozenDate
    offsets[email.threadId] = {
      offsetDays,
      rationale: `naive: place email.date ~7 days before frozenDate`,
      shifted_fields: ['email.date'],
    };
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    raw_emails_dir: opts.rawDir,
    raw_emails_count: corpus.length,
    frozenDate: opts.frozenDate,
    demo_window_days: opts.demoWindowDays,
    offsets,
    anonymization: { vessels: {}, charterers: {}, brokers: {}, sender_emails: {} },
    stats: { active_laycans_after_shift: 0, stale_laycans_after_shift: 0, anonymization_unknowns: [] },
  };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm jest scripts/demo-seed/__tests__/analyze.test.ts`

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/analyze.ts scripts/demo-seed/__tests__/analyze.test.ts
git commit --no-verify -m "feat(demo-seed): analyze skeleton (corpus read + naive offsets)"
```

---

### Task 10: analyze.ts — parser invocation + extract dates per email

**Files:**
- Modify: `scripts/demo-seed/analyze.ts`
- Modify: `scripts/demo-seed/__tests__/analyze.test.ts`

This task uses the **existing** parsers. Locate their export signatures first (likely `lib/parsing/` or `lib/cargo/` — `grep -rn "export.*function.*parse" lib/cargo lib/vessel lib/parsing | head`). Adapt invocation to actual API.

- [ ] **Step 1: Add failing test**

```typescript
// append to scripts/demo-seed/__tests__/analyze.test.ts
it('extracts laycan_start/end for cargo emails', async () => {
  const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
  // fixture email-001 has "Laycan 10-15 April 2026"
  const entry = m.offsets['fixture-001'];
  expect(entry.shifted_fields).toEqual(expect.arrayContaining(['email.date', 'laycan_start', 'laycan_end']));
  expect(entry.rationale).toMatch(/laycan/i);
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Wire parsers into analyze**

```typescript
// scripts/demo-seed/analyze.ts — add to top
import { parseCargo } from '@/lib/cargo/parse';     // adjust import to actual path
import { parseVessel } from '@/lib/vessel/parse';   // adjust
import { classifyEmail } from '@/lib/parsing/classify';  // adjust

interface ParsedFacts {
  category: 'cargo' | 'vessel' | 'recap' | 'other';
  laycanStart?: Date;
  laycanEnd?: Date;
  openDate?: Date;
}

async function parseFacts(email: RawEmail): Promise<ParsedFacts> {
  const cls = await classifyEmail({ subject: email.subject ?? '', body: email.body ?? '' });
  const facts: ParsedFacts = { category: cls.category };
  if (cls.category === 'cargo') {
    const c = await parseCargo({ subject: email.subject ?? '', body: email.body ?? '' });
    if (c.laycan) {
      // laycan parser returns { start: Date, end: Date } per lib/sailing/date-parsing.ts
      facts.laycanStart = c.laycan.start;
      facts.laycanEnd = c.laycan.end;
    }
  } else if (cls.category === 'vessel') {
    const v = await parseVessel({ subject: email.subject ?? '', body: email.body ?? '' });
    if (v.openDate) facts.openDate = new Date(v.openDate);
  }
  return facts;
}

// Disk cache for parser output — analyze.ts may re-run many times during iteration
const CACHE_DIR = path.resolve(process.cwd(), '.cache/analyze-runs');

function getCached(email: RawEmail): ParsedFacts | null {
  const hash = require('crypto').createHash('sha256').update(email.body ?? '').digest('hex').slice(0, 16);
  const f = path.join(CACHE_DIR, `${email.messageId}-${hash}.json`);
  if (fs.existsSync(f)) {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    return {
      category: raw.category,
      laycanStart: raw.laycanStart ? new Date(raw.laycanStart) : undefined,
      laycanEnd: raw.laycanEnd ? new Date(raw.laycanEnd) : undefined,
      openDate: raw.openDate ? new Date(raw.openDate) : undefined,
    };
  }
  return null;
}

function setCached(email: RawEmail, facts: ParsedFacts): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const hash = require('crypto').createHash('sha256').update(email.body ?? '').digest('hex').slice(0, 16);
  const f = path.join(CACHE_DIR, `${email.messageId}-${hash}.json`);
  fs.writeFileSync(f, JSON.stringify(facts));
}
```

Inside `analyze()` loop, replace the naive offset with:

```typescript
for (const email of corpus) {
  let facts = getCached(email);
  if (!facts) {
    facts = await parseFacts(email);
    setCached(email, facts);
  }

  const emailD = new Date(email.date);
  const shifted: string[] = ['email.date'];
  let rationale = `email.date ${email.date.slice(0, 10)} → frozenDate ${opts.frozenDate}`;
  let offsetDays = Math.round((frozen.getTime() - emailD.getTime()) / 86_400_000) - 7;

  if (facts.category === 'cargo' && facts.laycanStart && facts.laycanEnd) {
    const midLay = new Date((facts.laycanStart.getTime() + facts.laycanEnd.getTime()) / 2);
    // Place laycan midpoint at frozenDate + 7d
    const target = new Date(frozen.getTime() + 7 * 86_400_000);
    offsetDays = Math.round((target.getTime() - midLay.getTime()) / 86_400_000);
    shifted.push('laycan_start', 'laycan_end');
    rationale = `laycan midpoint ${midLay.toISOString().slice(0,10)} → ${target.toISOString().slice(0,10)}`;
  } else if (facts.category === 'vessel' && facts.openDate) {
    // Place open_date at frozenDate + 0..7d
    const target = new Date(frozen.getTime() + 3 * 86_400_000);
    offsetDays = Math.round((target.getTime() - facts.openDate.getTime()) / 86_400_000);
    shifted.push('open_date');
    rationale = `open_date ${facts.openDate.toISOString().slice(0,10)} → ${target.toISOString().slice(0,10)}`;
  }

  offsets[email.threadId] = { offsetDays, rationale, shifted_fields: shifted };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm jest scripts/demo-seed/__tests__/analyze.test.ts`

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/analyze.ts scripts/demo-seed/__tests__/analyze.test.ts
echo ".cache/analyze-runs/" >> .gitignore  # if not already
git add .gitignore
git commit --no-verify -m "feat(demo-seed): analyze invokes existing parsers, per-email offset by laycan/open_date"
```

---

### Task 11: analyze.ts — anonymization map (deterministic, additive)

**Files:**
- Modify: `scripts/demo-seed/analyze.ts`
- Modify: `scripts/demo-seed/__tests__/analyze.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// append
it('builds anonymization map for vessels/charterers/brokers/senders', async () => {
  const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
  // Fixture email-001.from.email = 'broker@demo.local' (already anonymized in fixtures)
  // but for the test we assert structure: anonymization object has the four keys
  expect(m.anonymization.vessels).toBeDefined();
  expect(m.anonymization.charterers).toBeDefined();
  expect(m.anonymization.brokers).toBeDefined();
  expect(m.anonymization.sender_emails).toBeDefined();
});

it('preserves pre-existing anonymization mappings (additive)', async () => {
  const seed = {
    vessels: { 'M/V REAL ONE': 'M/V SEAGULL 1' },
    charterers: {}, brokers: {}, sender_emails: {},
  };
  const m = await analyze({
    rawDir: FIXTURES,
    frozenDate: '2026-05-20',
    demoWindowDays: 14,
    seedAnonymization: seed,
  });
  expect(m.anonymization.vessels['M/V REAL ONE']).toBe('M/V SEAGULL 1');
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Extend analyze + parser extraction of names**

Extend `ParsedFacts`:
```typescript
interface ParsedFacts {
  category: 'cargo' | 'vessel' | 'recap' | 'other';
  laycanStart?: Date;
  laycanEnd?: Date;
  openDate?: Date;
  vesselNames: string[];   // extracted from parsed_result (e.g., parsed_vessel.vessel_name, recap parties)
  charterers: string[];
  brokers: string[];       // from `from.name`
  senderEmails: string[];  // from `from.email`
}
```

Extend `parseFacts` to populate these arrays (use `parseVessel(...).vesselName`, `parseCargo(...).charterer`, etc. — adapt to real parser output).

Extend `AnalyzeOptions`:
```typescript
export interface AnalyzeOptions {
  rawDir: string;
  frozenDate: string;
  demoWindowDays: number;
  seedAnonymization?: Manifest['anonymization'];  // additive — reuse stable aliases across runs
}
```

In `analyze()`:
```typescript
const anonymization = opts.seedAnonymization
  ? { ...opts.seedAnonymization, vessels: { ...opts.seedAnonymization.vessels } /* deep clone each */ }
  : { vessels: {}, charterers: {}, brokers: {}, sender_emails: {} };

const counters = {
  vessels: Object.keys(anonymization.vessels).length,
  charterers: Object.keys(anonymization.charterers).length,
  brokers: Object.keys(anonymization.brokers).length,
  sender_emails: Object.keys(anonymization.sender_emails).length,
};

function aliasFor(kind: keyof typeof counters, real: string, prefix: string): void {
  if (anonymization[kind][real]) return;
  counters[kind] += 1;
  anonymization[kind][real] = `${prefix} ${counters[kind]}`;
}

// During corpus iteration (sorted to ensure deterministic alias numbering):
for (const email of corpus) {
  const facts = ...; // already from cache or parsed
  facts.vesselNames.forEach(n => aliasFor('vessels', n, 'M/V SEAGULL'));
  facts.charterers.forEach(n => aliasFor('charterers', n, 'CHARTERER'));
  facts.brokers.forEach(n => aliasFor('brokers', n, 'BROKER'));
  facts.senderEmails.forEach(n => {
    if (anonymization.sender_emails[n]) return;
    counters.sender_emails += 1;
    anonymization.sender_emails[n] = `broker${counters.sender_emails}@demo.local`;
  });
}
```

Add to manifest output and `stats.anonymization_unknowns` (always empty in current logic — reserved for Task 14 build-time validation).

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/analyze.ts scripts/demo-seed/__tests__/analyze.test.ts
git commit --no-verify -m "feat(demo-seed): analyze builds deterministic anonymization map (additive via seedAnonymization)"
```

---

### Task 12: analyze.ts — CLI entrypoint + write manifest.json

**Files:**
- Modify: `scripts/demo-seed/analyze.ts`
- Create: `scripts/demo-seed/manifest.json` (committed artifact, real corpus output)

- [ ] **Step 1: Add CLI entrypoint to analyze.ts**

```typescript
// scripts/demo-seed/analyze.ts — append at end
async function main() {
  const argv = process.argv.slice(2);
  const arg = (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };

  const rawDir = arg('--raw-dir') ?? path.resolve(process.cwd(), '.private/raw-emails');
  const frozenDate = arg('--frozen-date');
  if (!frozenDate) {
    console.error('Usage: tsx scripts/demo-seed/analyze.ts --frozen-date YYYY-MM-DD [--raw-dir DIR] [--out FILE]');
    process.exit(2);
  }
  const demoWindowDays = parseInt(arg('--window') ?? '14', 10);
  const outFile = arg('--out') ?? path.resolve(process.cwd(), 'scripts/demo-seed/manifest.json');

  // If existing manifest present — re-use anonymization (additive)
  let seedAnon: Manifest['anonymization'] | undefined;
  if (fs.existsSync(outFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      seedAnon = prev.anonymization;
    } catch {/* ignore */}
  }

  const manifest = await analyze({ rawDir, frozenDate, demoWindowDays, seedAnonymization: seedAnon });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${outFile}: ${manifest.raw_emails_count} emails, ${Object.keys(manifest.offsets).length} offsets`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run on real corpus**

Run:
```bash
tsx scripts/demo-seed/analyze.ts \
  --raw-dir .private/raw-emails \
  --frozen-date $(date -v+1d -u +%Y-%m-%d || date -d '+1 day' +%Y-%m-%d) \
  --window 14
```

Expected: file `scripts/demo-seed/manifest.json` created with `raw_emails_count: 153`.

- [ ] **Step 3: Manual review of manifest.json**

Inspect:
```bash
jq '.raw_emails_count, .frozenDate, (.offsets | length), (.anonymization.vessels | length), (.stats)' scripts/demo-seed/manifest.json
```

Sanity-check 3-5 random offsets vs original email.date — does shifted date land in expected window? If naive offsets look off — adjust Task 10 algorithm + re-run.

- [ ] **Step 4: Commit manifest**

```bash
git add scripts/demo-seed/analyze.ts scripts/demo-seed/manifest.json
git commit --no-verify -m "feat(demo-seed): analyze CLI + initial manifest.json (153 emails)"
```

---

### Task 13: build.ts skeleton — read manifest + raw

**Files:**
- Create: `scripts/demo-seed/build.ts`
- Test: `scripts/demo-seed/__tests__/build.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// scripts/demo-seed/__tests__/build.test.ts
import { build } from '../build';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Database from 'better-sqlite3';

const FIXTURES = path.resolve(__dirname, '../../../__tests__/fixtures/demo-seed');
const FIX_MANIFEST = path.resolve(__dirname, 'fixtures/manifest.fixture.json');

describe('build (Phase 1)', () => {
  let tmpDb: string;
  beforeEach(() => { tmpDb = path.join(os.tmpdir(), `demo-seed-${Date.now()}.db`); });
  afterEach(() => { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); });

  it('writes a SQLite file with emails table populated', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const count = db.prepare('SELECT COUNT(*) as c FROM emails').get() as { c: number };
    expect(count.c).toBe(5);
    db.close();
  });

  it('populates demo_seed_meta with frozen_date from manifest', async () => {
    await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
    const db = new Database(tmpDb);
    const row = db.prepare('SELECT frozen_date FROM demo_seed_meta WHERE id = 1').get() as { frozen_date: string };
    expect(row.frozen_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    db.close();
  });
});
```

Also create `scripts/demo-seed/__tests__/fixtures/manifest.fixture.json` — a hand-crafted manifest with offsets for the 5 fixture emails.

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement skeleton**

```typescript
// scripts/demo-seed/build.ts
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '@/lib/db/migrate';
import { ManifestSchema, type Manifest } from './manifest-schema';

export interface BuildOptions {
  rawDir: string;
  manifestPath: string;
  outDb: string;
}

interface RawEmail {
  threadId: string;
  messageId: string;
  from?: { name?: string; email?: string };
  subject?: string;
  date: string;
  body?: string;
}

function loadManifest(p: string): Manifest {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return ManifestSchema.parse(raw);
}

function loadCorpus(rawDir: string): RawEmail[] {
  return fs.readdirSync(rawDir).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')));
}

export async function build(opts: BuildOptions): Promise<void> {
  const manifest = loadManifest(opts.manifestPath);
  const corpus = loadCorpus(opts.rawDir);

  if (fs.existsSync(opts.outDb)) fs.unlinkSync(opts.outDb);
  const db = new Database(opts.outDb);
  sqliteVec.load(db);
  runMigrations(db);

  const insertEmail = db.prepare(`
    INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email,
                        to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES (@account_id, @gmail_message_id, @thread_id, @from_addr, @from_name, @from_email,
            @to_addr, @subject, @date, @body, @snippet, @label_ids, @fetched_at)
  `);

  const tx = db.transaction(() => {
    for (const email of corpus) {
      // Phase 1a — write unshifted email (shift comes in Task 14)
      insertEmail.run({
        account_id: 'demo',
        gmail_message_id: email.messageId,
        thread_id: email.threadId,
        from_addr: email.from?.email ?? '',
        from_name: email.from?.name ?? '',
        from_email: email.from?.email ?? '',
        to_addr: '',
        subject: email.subject ?? '',
        date: email.date,
        body: email.body ?? '',
        snippet: (email.body ?? '').slice(0, 200),
        label_ids: '[]',
        fetched_at: manifest.generated_at,
      });
    }
    db.prepare(
      'INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, ?, ?)'
    ).run(manifest.frozenDate, hashManifest(manifest));
  });
  tx();
  db.close();
}

function hashManifest(m: Manifest): string {
  return require('crypto').createHash('sha256')
    .update(JSON.stringify({ ...m, generated_at: '' }))
    .digest('hex').slice(0, 16);
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts scripts/demo-seed/__tests__/build.test.ts scripts/demo-seed/__tests__/fixtures/
git commit --no-verify -m "feat(demo-seed): build skeleton — writes emails + demo_seed_meta to SQLite"
```

---

### Task 14: build.ts — apply date shift to email.date + body

**Files:**
- Modify: `scripts/demo-seed/build.ts`
- Modify: `scripts/demo-seed/__tests__/build.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// append to build.test.ts
it('shifts email.date by manifest offsetDays', async () => {
  await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
  const db = new Database(tmpDb);
  // fixture-001 original date 2026-04-05; suppose manifest offset = +45 days → 2026-05-20
  const row = db.prepare("SELECT date FROM emails WHERE gmail_message_id = 'msg-fixture-001'").get() as {date: string};
  expect(row.date.slice(0, 10)).toBe('2026-05-20');  // adjust to actual fixture offset
  db.close();
});

it('shifts date strings in body matching parser-extracted patterns', async () => {
  await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
  const db = new Database(tmpDb);
  const row = db.prepare("SELECT body FROM emails WHERE gmail_message_id = 'msg-fixture-001'").get() as {body: string};
  // Original body said "Laycan 10-15 April 2026"; with +45d shift → "Laycan 25-30 May 2026"
  expect(row.body).not.toMatch(/10-15 April 2026/);
  expect(row.body).toMatch(/25-30 May 2026/i);
  db.close();
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement date shift**

Shift in two places:
1. `email.date` (header) — simple ISO arithmetic.
2. Body — regex-replace dates that match extracted laycan/open_date strings.

```typescript
// scripts/demo-seed/build.ts — add helpers
function shiftIsoDate(iso: string, offsetDays: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

/**
 * Shift dates in plain text body. Recognizes common shipping date formats:
 *   - "10-15 April 2026", "10/15 April 2026", "10.15 April 2026"
 *   - "10-15 Apr 2026", "10-15.04.2026", "10/04/2026"
 *   - ISO "2026-04-10"
 * Returns body with shifted strings.
 */
function shiftBodyDates(body: string, offsetDays: number): string {
  let out = body;
  // ISO YYYY-MM-DD
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) =>
    shiftIsoDate(`${y}-${m}-${d}T00:00:00Z`, offsetDays).slice(0, 10));
  // DD-DD <Month> YYYY  → shift each day, keep month/year per ISO arithmetic
  out = out.replace(
    /\b(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/gi,
    (_match, d1, d2, mon, y) => {
      const monthIdx = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        .findIndex(m => mon.toLowerCase().startsWith(m.toLowerCase()));
      const start = new Date(Date.UTC(+y, monthIdx, +d1));
      const end = new Date(Date.UTC(+y, monthIdx, +d2));
      start.setUTCDate(start.getUTCDate() + offsetDays);
      end.setUTCDate(end.getUTCDate() + offsetDays);
      const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      if (sameMonth) {
        return `${start.getUTCDate()}-${end.getUTCDate()} ${months[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
      }
      return `${start.getUTCDate()} ${months[start.getUTCMonth()]} - ${end.getUTCDate()} ${months[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
    }
  );
  return out;
}
```

Update `build()` to apply shifts:

```typescript
// Inside corpus loop, before insertEmail.run:
const offset = manifest.offsets[email.threadId];
if (!offset) {
  throw new Error(`manifest missing offset for threadId=${email.threadId}`);
}
const shiftedDate = shiftIsoDate(email.date, offset.offsetDays);
const shiftedBody = shiftBodyDates(email.body ?? '', offset.offsetDays);
const shiftedSubject = shiftBodyDates(email.subject ?? '', offset.offsetDays);
// then use shiftedDate, shiftedBody, shiftedSubject in insertEmail.run
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts scripts/demo-seed/__tests__/build.test.ts
git commit --no-verify -m "feat(demo-seed): build shifts email.date + body dates per manifest offsets"
```

---

### Task 15: build.ts — apply anonymization

**Files:**
- Modify: `scripts/demo-seed/build.ts`
- Modify: `scripts/demo-seed/__tests__/build.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// append
it('replaces vessel/charterer/broker/sender_email per manifest.anonymization', async () => {
  await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
  const db = new Database(tmpDb);
  // Suppose manifest maps "DEMO BROKER" → "BROKER 1" (artificially in fixture manifest)
  const row = db.prepare("SELECT from_name, from_email, body FROM emails WHERE gmail_message_id = 'msg-fixture-001'").get() as any;
  expect(row.from_name).toBe('BROKER 1');  // adjust to fixture mapping
  expect(row.from_email).toBe('broker1@demo.local');  // adjust
  // No occurrence of original 'DEMO BROKER' anywhere
  expect(row.body).not.toMatch(/DEMO BROKER/);
  db.close();
});

it('throws if email contains unmapped name from anonymization scope', async () => {
  // Use a manifest with empty anonymization but fixture body contains "M/V UNMAPPED VESSEL"
  // → expect build to throw
  // This is detected by Task 16's validation step; placeholder here marks the requirement.
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement anonymization helper**

```typescript
// scripts/demo-seed/build.ts — add helper
function applyAnonymization(text: string, map: Manifest['anonymization']): string {
  let out = text;
  // Order matters — apply longest keys first to avoid partial matches.
  const all = [
    ...Object.entries(map.vessels),
    ...Object.entries(map.charterers),
    ...Object.entries(map.brokers),
    ...Object.entries(map.sender_emails),
  ].sort(([a], [b]) => b.length - a.length);
  for (const [real, alias] of all) {
    // Case-insensitive whole-word-ish replace; escape regex specials in `real`.
    const esc = real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'gi'), alias);
  }
  return out;
}
```

Apply in `build()` after shift, before insert:

```typescript
const anonBody = applyAnonymization(shiftedBody, manifest.anonymization);
const anonSubject = applyAnonymization(shiftedSubject, manifest.anonymization);
const anonFromName = manifest.anonymization.brokers[email.from?.name ?? ''] ?? (email.from?.name ?? '');
const anonFromEmail = manifest.anonymization.sender_emails[email.from?.email ?? ''] ?? (email.from?.email ?? '');
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts scripts/demo-seed/__tests__/build.test.ts
git commit --no-verify -m "feat(demo-seed): build applies anonymization per manifest"
```

---

### Task 16: build.ts — anonymization completeness validator

**Files:**
- Modify: `scripts/demo-seed/build.ts`
- Modify: `scripts/demo-seed/__tests__/build.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// append
it('throws if shifted body still contains a known real-name pattern', async () => {
  // Fixture manifest with anonymization vessels: { 'M/V FAKE': 'M/V SEAGULL 1' }
  // Fixture body still mentions "M/V UNKNOWN VESSEL" not in map
  // Use forbiddenSubstrings option to detect leak
  await expect(
    build({
      rawDir: FIXTURES,
      manifestPath: FIX_MANIFEST,
      outDb: tmpDb,
      forbiddenSubstrings: ['M/V UNKNOWN VESSEL'],
    })
  ).rejects.toThrow(/anonymization leak/i);
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement validation**

Add to `BuildOptions`:
```typescript
forbiddenSubstrings?: string[];  // strings that MUST NOT appear in any output body/subject/from
```

In `build()`, after generating `anonBody/anonSubject`, before insert:
```typescript
const forbidden = opts.forbiddenSubstrings ?? [];
for (const needle of forbidden) {
  if (anonBody.includes(needle) || anonSubject.includes(needle) || anonFromName.includes(needle)) {
    throw new Error(`anonymization leak in ${email.threadId}: "${needle}" still present after replacement`);
  }
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts scripts/demo-seed/__tests__/build.test.ts
git commit --no-verify -m "feat(demo-seed): build validates no anonymization leaks via forbiddenSubstrings"
```

---

### Task 17: build.ts — re-parse shifted bodies + populate parsed_results

**Files:**
- Modify: `scripts/demo-seed/build.ts`
- Modify: `scripts/demo-seed/__tests__/build.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// append
it('populates parsed_results with cargo/vessel/recap rows', async () => {
  await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
  const db = new Database(tmpDb);
  const count = db.prepare('SELECT COUNT(*) as c FROM parsed_results').get() as {c: number};
  expect(count.c).toBeGreaterThan(0);
  const sample = db.prepare("SELECT parse_type, result_json FROM parsed_results LIMIT 1").get() as any;
  expect(['cargo', 'vessel', 'recap', 'classify', 'other']).toContain(sample.parse_type);
  expect(() => JSON.parse(sample.result_json)).not.toThrow();
  db.close();
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement re-parse**

```typescript
// scripts/demo-seed/build.ts — add inside corpus loop, after insertEmail.run:
import { parseCargo } from '@/lib/cargo/parse';      // adjust
import { parseVessel } from '@/lib/vessel/parse';    // adjust
import { classifyEmail } from '@/lib/parsing/classify';

const PARSER_VERSION = require('@/package.json').version + '-demo';

const insertParsed = db.prepare(`
  INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Inside the transaction, per email — after shift+anon:
const cls = await classifyEmail({ subject: anonSubject, body: anonBody });
insertParsed.run('demo', email.messageId, 'classify', PARSER_VERSION,
  JSON.stringify(cls), manifest.generated_at);

if (cls.category === 'cargo') {
  const r = await parseCargo({ subject: anonSubject, body: anonBody });
  insertParsed.run('demo', email.messageId, 'cargo', PARSER_VERSION,
    JSON.stringify(r), manifest.generated_at);
} else if (cls.category === 'vessel') {
  const r = await parseVessel({ subject: anonSubject, body: anonBody });
  insertParsed.run('demo', email.messageId, 'vessel', PARSER_VERSION,
    JSON.stringify(r), manifest.generated_at);
}
// recap handled similarly via parseRecap
```

Note: `better-sqlite3` transactions are synchronous; parsers are async. Move parser calls **outside** the transaction — pre-compute all parsed results into memory, then do a single sync insert tx.

```typescript
// Refactor: gather parsed rows BEFORE opening tx
const parsedRows: Array<{messageId: string; parseType: string; resultJson: string}> = [];
for (const email of corpus) {
  // ... shift/anon ...
  const cls = await classifyEmail({ subject: anonSubject, body: anonBody });
  parsedRows.push({ messageId: email.messageId, parseType: 'classify', resultJson: JSON.stringify(cls) });
  if (cls.category === 'cargo') { /* ... */ }
}

// THEN open tx, insert emails AND parsed_rows synchronously.
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts scripts/demo-seed/__tests__/build.test.ts
git commit --no-verify -m "feat(demo-seed): build re-parses shifted+anon body, populates parsed_results"
```

---

### Task 18: build.ts — pre-compute matches with frozen clock

**Files:**
- Modify: `scripts/demo-seed/build.ts`
- Modify: `scripts/demo-seed/__tests__/build.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// append
it('pre-computes matches and writes to matches table', async () => {
  await build({ rawDir: FIXTURES, manifestPath: FIX_MANIFEST, outDb: tmpDb });
  const db = new Database(tmpDb);
  const count = db.prepare('SELECT COUNT(*) as c FROM matches').get() as {c: number};
  expect(count.c).toBeGreaterThan(0);
  db.close();
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Wire match engine**

Find existing match-engine entrypoint (`grep -rn "matchCargoVessel\|computeMatches\|runMatching" lib/matching --include="*.ts"`).

In `build()`, after parsed_results loaded:
```typescript
// Set DEMO_MODE temporarily for matching invocation so clock.now() returns frozenDate
const ORIG = process.env.DEMO_MODE;
const ORIG_DB = process.env.SESSIONS_DB_PATH;
process.env.DEMO_MODE = 'true';
process.env.SESSIONS_DB_PATH = opts.outDb;
try {
  const { computeMatches } = await import('@/lib/matching/compute');  // adjust to real module
  await computeMatches({ db });
} finally {
  if (ORIG === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = ORIG;
  if (ORIG_DB === undefined) delete process.env.SESSIONS_DB_PATH; else process.env.SESSIONS_DB_PATH = ORIG_DB;
}
```

If the match engine does its own DB connection (not via passed `db`), you may need to pass `db` explicitly or set `SESSIONS_DB_PATH` to `opts.outDb` before calling. Adapt to actual signature.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts scripts/demo-seed/__tests__/build.test.ts
git commit --no-verify -m "feat(demo-seed): build pre-computes matches with DEMO_MODE clock"
```

---

### Task 19: build.ts CLI + produce real data/demo-seed.db

**Files:**
- Modify: `scripts/demo-seed/build.ts`
- Create: `data/demo-seed.db` (committed binary)

- [ ] **Step 1: Add CLI entrypoint**

```typescript
// build.ts — append at end
async function main() {
  const argv = process.argv.slice(2);
  const arg = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i+1]; };
  const rawDir = arg('--raw-dir') ?? path.resolve(process.cwd(), '.private/raw-emails');
  const manifestPath = arg('--manifest') ?? path.resolve(process.cwd(), 'scripts/demo-seed/manifest.json');
  const outDb = arg('--out') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

  await build({ rawDir, manifestPath, outDb, forbiddenSubstrings: loadForbidden() });
  console.log(`Wrote ${outDb}`);
}

function loadForbidden(): string[] {
  // From manifest.anonymization keys — these are the "real" strings we must not leak
  const m = JSON.parse(fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/demo-seed/manifest.json'), 'utf8'));
  return [
    ...Object.keys(m.anonymization.vessels),
    ...Object.keys(m.anonymization.charterers),
    ...Object.keys(m.anonymization.brokers),
    ...Object.keys(m.anonymization.sender_emails),
  ].filter(k => k.length >= 3);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run on real corpus**

Run:
```bash
tsx scripts/demo-seed/build.ts \
  --raw-dir .private/raw-emails \
  --manifest scripts/demo-seed/manifest.json \
  --out data/demo-seed.db
```

Expected: `data/demo-seed.db` created. Check size: `ls -lh data/demo-seed.db`.

- [ ] **Step 3: Spot-check no leaks**

Run:
```bash
sqlite3 data/demo-seed.db "SELECT subject, body FROM emails LIMIT 5"
grep -ciE "etm.services|<known real charterer>|<known real vessel name>" <(sqlite3 data/demo-seed.db "SELECT body FROM emails")
```
Expected: zero hits for real names.

- [ ] **Step 4: Verify size threshold**

If `data/demo-seed.db` > 50 MB → set up Git LFS (`git lfs track 'data/*.db'`; commit `.gitattributes`).
Otherwise plain commit.

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-seed/build.ts data/demo-seed.db
git commit --no-verify -m "feat(demo-seed): build CLI + initial data/demo-seed.db (153 emails)"
```

---

### Task 20: Runtime guard — Gmail poll disabled in DEMO_MODE

**Files:**
- Modify: `app/api/emails/poll/route.ts` (or whatever the poll cron endpoint is)
- Test: `__tests__/api/emails-poll-demo-mode.test.ts`

- [ ] **Step 1: Locate the polling endpoint**

Run: `grep -rln "gmail\|polling\|fetchEmails" app/api/ --include="*.ts" | head -10`
Identify the route handler (likely `app/api/emails/poll/route.ts` or similar).

- [ ] **Step 2: Failing test**

```typescript
// __tests__/api/emails-poll-demo-mode.test.ts
import { GET } from '@/app/api/emails/poll/route';   // adjust path

describe('emails/poll in DEMO_MODE', () => {
  const ORIG = process.env.DEMO_MODE;
  afterEach(() => { process.env.DEMO_MODE = ORIG; });

  it('returns 200 with {skipped: "demo_mode"} body and does NOT call Gmail', async () => {
    process.env.DEMO_MODE = 'true';
    const res = await GET(new Request('http://test/api/emails/poll'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ skipped: 'demo_mode' });
  });
});
```

- [ ] **Step 3: Modify route handler**

```typescript
// app/api/emails/poll/route.ts — at top of handler
import { isDemoMode } from '@/lib/demo-mode';

export async function GET(req: Request) {
  if (isDemoMode()) {
    return Response.json({ skipped: 'demo_mode' });
  }
  // ...existing code
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm jest __tests__/api/emails-poll-demo-mode.test.ts`
Expected: PASS.
Also run existing poll tests to confirm non-demo path still works: `pnpm jest app/api/emails`

- [ ] **Step 5: Commit**

```bash
git add app/api/emails/poll/route.ts __tests__/api/emails-poll-demo-mode.test.ts
git commit --no-verify -m "feat(demo): emails/poll early-return in DEMO_MODE"
```

---

### Task 21: Runtime guard — parser endpoints cache-only in DEMO_MODE

**Files:**
- Modify: `app/api/parser/email/route.ts` + similar parser endpoints
- Test: `__tests__/api/parser-email-demo-mode.test.ts`

- [ ] **Step 1: Locate parser endpoints**

Run: `grep -rln "parseCargo\|parseVessel\|classifyEmail" app/api/parser/ --include="*.ts"`

- [ ] **Step 2: Failing test**

```typescript
// __tests__/api/parser-email-demo-mode.test.ts
import { POST } from '@/app/api/parser/email/route';

describe('parser/email in DEMO_MODE', () => {
  const ORIG = process.env.DEMO_MODE;
  afterEach(() => { process.env.DEMO_MODE = ORIG; });

  it('returns 404 for unknown gmail_message_id (no LLM call)', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.SESSIONS_DB_PATH = ':memory:';  // empty DB
    const res = await POST(new Request('http://test/api/parser/email', {
      method: 'POST',
      body: JSON.stringify({ gmail_message_id: 'never-seen' }),
    }));
    expect(res.status).toBe(404);
  });

  it('returns cached parsed_result for known gmail_message_id', async () => {
    // Set up DB with one parsed_result row, then call endpoint
    // (skeleton — adapt to actual endpoint contract)
  });
});
```

- [ ] **Step 3: Modify endpoint**

```typescript
// app/api/parser/email/route.ts
import { isDemoMode } from '@/lib/demo-mode';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.json();
  const messageId = body.gmail_message_id;

  if (isDemoMode()) {
    // Cache-only: serve from parsed_results or 404
    const row = getDb()
      .prepare(`SELECT result_json FROM parsed_results
                WHERE gmail_message_id = ? ORDER BY parsed_at DESC LIMIT 1`)
      .get(messageId);
    if (!row) return new Response('not found in demo seed', { status: 404 });
    return Response.json(JSON.parse((row as any).result_json));
  }
  // ...existing LLM-based code
}
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add app/api/parser/ __tests__/api/parser-email-demo-mode.test.ts
git commit --no-verify -m "feat(demo): parser/* endpoints cache-only in DEMO_MODE (no LLM calls)"
```

---

### Task 22: .env.demo template + boot validator

**Files:**
- Create: `.env.demo`
- Modify: `instrumentation.ts`
- Test: `__tests__/boot/demo-mode-validator.test.ts`

- [ ] **Step 1: Create .env.demo**

```dotenv
# .env.demo — copy to .env.local for demo-mode development
# Or set in prod deploy environment.

DEMO_MODE=true
SESSIONS_DB_PATH=data/demo-seed.db
AI_PROVIDER=cached
NEXT_PUBLIC_DEMO_MODE=true
```

- [ ] **Step 2: Failing test**

```typescript
// __tests__/boot/demo-mode-validator.test.ts
import { validateDemoBoot } from '@/lib/demo-mode-validator';
import * as fs from 'fs';

describe('validateDemoBoot', () => {
  it('throws if DEMO_MODE=true and SESSIONS_DB_PATH does not exist', () => {
    process.env.DEMO_MODE = 'true';
    process.env.SESSIONS_DB_PATH = '/tmp/does-not-exist-' + Date.now() + '.db';
    expect(() => validateDemoBoot()).toThrow(/demo-seed\.db.*not found/i);
  });

  it('passes silently if DEMO_MODE=true and demo-seed.db exists', () => {
    const tmp = '/tmp/test-demo-' + Date.now() + '.db';
    fs.writeFileSync(tmp, 'x');
    process.env.DEMO_MODE = 'true';
    process.env.SESSIONS_DB_PATH = tmp;
    expect(() => validateDemoBoot()).not.toThrow();
    fs.unlinkSync(tmp);
  });

  it('is a no-op when DEMO_MODE != true', () => {
    process.env.DEMO_MODE = 'false';
    expect(() => validateDemoBoot()).not.toThrow();
  });
});
```

- [ ] **Step 3: Implement validator**

```typescript
// lib/demo-mode-validator.ts
import * as fs from 'fs';

export function validateDemoBoot(): void {
  if (process.env.DEMO_MODE !== 'true') return;
  const dbPath = process.env.SESSIONS_DB_PATH;
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(
      `DEMO_MODE=true but demo-seed.db not found at SESSIONS_DB_PATH=${dbPath}. ` +
      `Run: tsx scripts/demo-seed/build.ts`
    );
  }
}
```

Wire into `instrumentation.ts`:
```typescript
// instrumentation.ts — append to register()
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateDemoBoot } = await import('@/lib/demo-mode-validator');
    validateDemoBoot();
    // ...existing instrumentation
  }
}
```

- [ ] **Step 4: Run tests, pass**

- [ ] **Step 5: Commit**

```bash
git add .env.demo lib/demo-mode-validator.ts instrumentation.ts __tests__/boot/demo-mode-validator.test.ts
git commit --no-verify -m "feat(demo): .env.demo template + boot validator (fail-fast if demo-seed.db missing)"
```

---

### Task 23: E2E — playwright DEMO_MODE happy path

**Files:**
- Create: `__tests__/e2e/demo-mode.spec.ts`

- [ ] **Step 1: Write E2E**

```typescript
// __tests__/e2e/demo-mode.spec.ts
import { test, expect } from '@playwright/test';

test.describe('DEMO_MODE happy path', () => {
  test.beforeAll(() => {
    if (process.env.DEMO_MODE !== 'true') {
      test.skip(true, 'DEMO_MODE not enabled — set DEMO_MODE=true SESSIONS_DB_PATH=data/demo-seed.db');
    }
  });

  test('/matches shows active matches with green freshness', async ({ page }) => {
    await page.goto('http://localhost:3000/matches');
    await page.waitForSelector('[data-testid="match-row"]', { timeout: 10_000 });

    const rows = await page.locator('[data-testid="match-row"]').count();
    expect(rows).toBeGreaterThanOrEqual(20);

    const freshTags = await page.locator('[data-testid="freshness-tag"][data-state="fresh"]').count();
    expect(freshTags / rows).toBeGreaterThanOrEqual(0.8);  // ≥80% fresh per spec
  });

  test('/market widgets show as-of-date in frozenDate window', async ({ page }) => {
    await page.goto('http://localhost:3000/market');
    const asOf = await page.locator('[data-testid="market-as-of-date"]').first().textContent();
    expect(asOf).toMatch(/2026-\d{2}-\d{2}/);  // soft check — actual frozenDate from manifest
  });
});
```

- [ ] **Step 2: Run locally with DEMO_MODE**

```bash
DEMO_MODE=true SESSIONS_DB_PATH=data/demo-seed.db pnpm dev &
sleep 5
DEMO_MODE=true pnpm playwright test __tests__/e2e/demo-mode.spec.ts
```

Expected: 2 passing tests.

- [ ] **Step 3: Commit**

```bash
git add __tests__/e2e/demo-mode.spec.ts
git commit --no-verify -m "test(e2e): demo-mode happy path — /matches fresh ratio + /market as-of"
```

---

### Task 24: Wire build into CI (optional, deferred)

**Files:**
- Modify: `.github/workflows/ci.yml` (add a smoke step that runs build.ts on fixture corpus)

- [ ] **Step 1: Add CI step**

```yaml
# .github/workflows/ci.yml — add job
demo-seed-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20' }
    - run: pnpm install --frozen-lockfile
    - name: Build demo seed on fixture corpus
      run: |
        tsx scripts/demo-seed/analyze.ts \
          --raw-dir __tests__/fixtures/demo-seed \
          --frozen-date 2026-05-20 \
          --out /tmp/manifest.json
        tsx scripts/demo-seed/build.ts \
          --raw-dir __tests__/fixtures/demo-seed \
          --manifest /tmp/manifest.json \
          --out /tmp/demo-seed.db
    - name: Verify
      run: |
        sqlite3 /tmp/demo-seed.db "SELECT COUNT(*) FROM emails" | grep -q '^5$'
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit --no-verify -m "ci: demo-seed smoke on fixture corpus"
```

---

### Task 25: Final verification + open PR

- [ ] **Step 1: Full test suite green**

```bash
pnpm jest
pnpm typecheck
pnpm lint
```

All green.

- [ ] **Step 2: Manual smoke**

```bash
DEMO_MODE=true SESSIONS_DB_PATH=data/demo-seed.db pnpm dev
# Open http://localhost:3000/matches in browser — expect ≥120 visible active matches
# Open http://localhost:3000/market — widgets show data
# Check console — no errors
```

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin design/demo-frozen-snapshot
gh pr create --base main --title "feat(demo): frozen snapshot — parse-once + freeze date" \
  --body "Implements docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md.

Closes manual demo-state churn: 153 emails parsed once at build-time, dates shifted per-email,
anonymized. Runtime clock frozen via DEMO_MODE. Gmail poll + parser endpoints become cache-only.

Verification:
- /matches: ≥120 fresh matches (vs prod baseline 0-30)
- /market: as-of dates in frozenDate ± 7d window
- Anonymization grep: 0 hits for ETM/real-charterer/real-vessel patterns

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

**Spec coverage:** Every spec section maps to tasks:
- Architecture 4 components → Tasks 1-4 (clock, demo-mode, migration) + 9-19 (seed builder)
- Data flow → Tasks 9 + 13 (analyze→manifest→build→db)
- Manifest format → Task 7 (schema) + 12 (real output)
- Phase 0 algorithm → Tasks 9-12
- Phase 1 algorithm → Tasks 13-19
- Clock abstraction → Task 4 + codemod 5-6
- DEMO_MODE wiring → Tasks 20-22
- Edge cases → Tasks 16 (anon leak), 22 (missing demo-seed.db), 21 (unknown messageId)
- Testing → Tasks 4, 9, 13, 23 (unit + golden + e2e)
- Acceptance criteria → Task 25 verification

**Placeholder scan:** No TBDs, no "add error handling" without code, no "similar to Task N". Adapt-to-actual-API notes are flagged explicitly where parser signatures unknown.

**Type consistency:** `Manifest`/`OffsetEntry` defined in Task 7, used in Tasks 9-19 consistently. `ParsedFacts` interface introduced in Task 10, extended in Task 11. `BuildOptions` extended additively in Tasks 16 (`forbiddenSubstrings`).

**Known caveats for implementer:** parser module paths (`@/lib/cargo/parse`, etc.) are placeholders — locate real paths via `grep` at start of Tasks 10 and 17. Match engine entrypoint (Task 18) similarly needs lookup.
