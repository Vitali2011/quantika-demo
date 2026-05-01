# spec-betafix-09-fixture-13-or-script

**Plan:** beta-fixes | **Batch:** 2 | **Severity:** HIGH
**Source bug:** BUG-14 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`scripts/check-deadlines.ts --demo` → ENOENT `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json`. Existing scenarios: 01, 05, 08, 11, 14, 15. Scenario 13 никогда не создавался.

## Files in scope

- `scripts/check-deadlines.ts` (--demo handling)
- `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json` (create) ИЛИ
- Альтернатива: изменить `--demo` на existing scenario (e.g., 14).

## Recommended approach: create fixture 13

Existing scenarios 01-15 — pattern. Создать 13 в том же формате. Это даёт реалистичный subs-deadline-2h-warning case.

## Investigation

```bash
ls lib/sample-data/demo-scenarios/
cat lib/sample-data/demo-scenarios/14-*.json | head -30  # see schema
```

## Files FORBIDDEN

- Existing scenarios (read-only).
- `lib/deadlines/*` (BUG-β-10 deferred).

## TDD RED

```ts
import { runDeadlineCheck } from '../check-deadlines';

it('--demo loads scenario 13 без ENOENT', async () => {
  const result = await runDeadlineCheck({ demo: true });
  expect(result.error).toBeUndefined();
  expect(result.deadlinesProcessed).toBeGreaterThan(0);
});

it('scenario 13 содержит deal с subs deadline через ~2h', () => {
  const fixture = require('../../lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json');
  expect(fixture.deal).toBeDefined();
  expect(fixture.deal.subs_deadline).toBeDefined();
  // deadline должен быть within next 2-3 hours from "now" relative test
});
```

## Fix sketch

Создать `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json`:

```json
{
  "scenario_id": "13-subs-deadline-2h-warning",
  "description": "Demo scenario: deal with subs lifting deadline ~2 hours away",
  "deal": {
    "id": "demo-deal-13",
    "vessel": { "name": "MV BALTIC PIONEER", "imo": "9456789" },
    "cargo": { "type": "wheat", "qty_mt": 25000 },
    "load_port": "RUVOL",
    "discharge_port": "EGALY",
    "subs_deadline": "<RELATIVE_FROM_NOW: +2h>",
    "stage": "fixed_subjects",
    "notified_stages": []
  },
  "expected_actions": ["dispatch_2h_warning"]
}
```

И добавить в `check-deadlines.ts` resolver для `<RELATIVE_FROM_NOW: ...>` placeholder если нужен (либо использовать ISO timestamp относительно current Date).

Проще всего — использовать абсолютную дату с ISO + adjust в loader: при `--demo` script ставит deadline на `now + 2 hours` динамически.

## Acceptance criteria

- [ ] `npm run script:check-deadlines -- --demo` (или эквивалент) — не падает с ENOENT.
- [ ] Scenario 13 file существует и валиден JSON.
- [ ] Test проходит — runDeadlineCheck({demo:true}) обрабатывает ≥1 deadline.

## Commit

`fix(βf-09-fixture-13-or-script): create demo scenario 13-subs-deadline-2h-warning`
