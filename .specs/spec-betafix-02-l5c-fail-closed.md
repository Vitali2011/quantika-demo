# spec-betafix-02-l5c-fail-closed

**Plan:** beta-fixes | **Batch:** 1 | **Severity:** CRITICAL
**Source bug:** BUG-09 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`lib/cargo/l5c-matrix.ts:48-53` — для unknown cargo pair (нет данных в матрице) функция `checkCompatibility` возвращает `{compatible: true, warnings: ['No L5C data...']}`. Это **fail-open** — система говорит "OK" для случая где у неё нет данных. Coal→wheat получает зелёный свет → cargo contamination claim → P&I dispute.

**User decision:** fail-closed — `compatible: false, requires_manual_review: true` для unknown pairs. Known pairs не меняются.

## Files in scope

- `lib/cargo/l5c-matrix.ts` (only branch при unknown pair)
- `lib/cargo/__tests__/l5c-matrix.test.ts` (создать или append; ≤30 expects)

## Files FORBIDDEN

- `lib/cargo/l5c-matrix.json` (matrix data — НЕ расширяем здесь, отдельная wave-γ задача)
- Любые UI components использующие checkCompatibility

## TDD RED

```ts
import { checkCompatibility } from '../l5c-matrix';

describe('L5C fail-closed for unknown pairs', () => {
  it('coal → wheat in bags (unknown — нет в matrix) → compatible:false + requires_manual_review:true', () => {
    const r = checkCompatibility(['coal'], 'wheat in bags');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('iron ore → grain (KNOWN incompatible pair) — поведение не меняется (compatible:false из matrix)', () => {
    // если такая пара есть в matrix.json
    const r = checkCompatibility(['iron ore'], 'grain');
    expect(r.compatible).toBe(false);
  });

  it('clean ballast → any new cargo (нет prevCargoes) → compatible:true', () => {
    const r = checkCompatibility([], 'wheat');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
  });

  it('multiple prevs, ОДИН unknown → compatible:false + manual_review (one unknown poisons batch)', () => {
    const r = checkCompatibility(['petcoke', 'coal', 'unknownX'], 'wheat in bags');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
  });
});
```

## Fix sketch

В `lib/cargo/l5c-matrix.ts:48` (где `if (!pair) { warnings.push(...); continue; }`):

```ts
for (const prev of prevCargoes) {
  if (!prev?.trim()) continue;
  const pair = lookupPair(prev, newCargo);
  if (!pair) {
    warnings.push(`No L5C data for ${normalize(prev)}→${normalize(newCargo)}`);
    requires_manual_review = true;            // NEW
    blocking_pairs.push({                      // NEW
      previous: prev,
      reason: `No L5C data — manual surveyor review required`,
    });
    continue;
  }
  // ... остальное без изменений
}
```

После цикла compatible-флаг уже считается через `blocking_pairs.length === 0` — теперь unknown pair добавляет blocking entry → compatible становится false.

Альтернатива: ввести отдельное поле `unknown_pairs: [...]` и считать compatible как `blocking_pairs.length === 0 && unknown_pairs.length === 0`. Если этот вариант чище для downstream UI — выбрать его. **Решение остаётся за impl-агентом**, но поведение должно соответствовать acceptance criteria.

## Acceptance criteria

- [ ] Unknown pair → `compatible:false, requires_manual_review:true`.
- [ ] Known incompatible (matrix entry с `compatible:false`) — поведение не меняется.
- [ ] Known compatible (matrix entry с `compatible:true`) — поведение не меняется (`requires_manual_review:false` если только нет других нюансов).
- [ ] `prevCargoes: []` → compatible:true (clean ballast OK).
- [ ] Один unknown среди нескольких prev'ов → весь батч fail-closed.
- [ ] Warnings не пустые при unknown.
- [ ] Существующие тесты l5c не сломаны.

## Commit

`fix(βf-02-l5c-fail-closed): unknown cargo pair → compatible:false + requires_manual_review`
