# Merge & Verify — Quantika Demo Audit Fixes

## Branch Strategy
Каждая спека работает на ветке `spec/spec-NN-name`.
После каждого батча — Opus мержит ветки в main.

## Batch 0 Merge Protocol

### 1. Fetch
```bash
git fetch origin
git branch -a | grep "spec/"
```

### 2. Merge spec-00
```bash
git checkout main
git merge origin/spec/spec-00-foundation --no-ff -m "merge: spec-00 foundation types"
```

### 3. После мержа
- [ ] `npm test` — тесты проходят
- [ ] `grep -r "<<<<<<" src/` — нет conflict markers
- [ ] `git push`

---

## Batch 1 Merge Protocol (4 ветки)

### Sequential merge order:
```bash
git checkout main && git merge origin/spec/spec-01-parser-fixes --no-ff
npm test
git push

git checkout spec/spec-02-rate-intelligence && git merge main --no-edit && git push origin spec/spec-02-rate-intelligence
git checkout main && git merge origin/spec/spec-02-rate-intelligence --no-ff
npm test
git push

git checkout spec/spec-03-currency && git merge main --no-edit && git push origin spec/spec-03-currency
git checkout main && git merge origin/spec/spec-03-currency --no-ff
npm test
git push

git checkout spec/spec-04-subs-timer && git merge main --no-edit && git push origin spec/spec-04-subs-timer
git checkout main && git merge origin/spec/spec-04-subs-timer --no-ff
npm test
git push
```

### При конфликте
- Прочитай ОБОИХ спек (.specs/spec-NN.md) чтобы понять intent
- lib/types.ts — добавить типы обоих спек
- Запусти тесты после КАЖДОГО резолва

### После мержа всех
- [ ] `npm test` — все тесты проходят
- [ ] `grep -r "<<<<<<" src/` — нет conflict markers
- [ ] `npx tsc --noEmit` — TypeScript компилируется

---

## Batch 2 Merge Protocol (3 ветки)

```bash
git checkout main && git merge origin/spec/spec-05-tce-calculator --no-ff
npm test && git push

git checkout spec/spec-06-laytime-calc && git merge main --no-edit && git push origin spec/spec-06-laytime-calc
git checkout main && git merge origin/spec/spec-06-laytime-calc --no-ff
npm test && git push

git checkout spec/spec-07-fcl-lcl && git merge main --no-edit && git push origin spec/spec-07-fcl-lcl
git checkout main && git merge origin/spec/spec-07-fcl-lcl --no-ff
npm test && git push
```

---

## Batch 3 Merge Protocol (1 ветка)

```bash
git checkout main && git merge origin/spec/spec-08-integration --no-ff
npm test && git push
```

---

## Final Verification

### Quality Check
- [ ] `grep -rn "TODO\|FIXME\|placeholder" src/` — нет placeholder
- [ ] `grep -rn "console.log" src/` — нет debug logs
- [ ] `npx tsc --noEmit` — TypeScript OK

### Audit Requirements Verification
- [ ] Draft Quote показывает историческую ставку (не [RATE TO BE CONFIRMED])
- [ ] Commission breakdown: EUR freight показывает EUR + USD эквивалент
- [ ] Fixture recap: Subs секция с таймером и статусами pending/lifted
- [ ] Vessel position: "Gearless" → "Geared: No" в UI
- [ ] /voyage-calc страница доступна и считает TCE
- [ ] Fixture recap: Laytime виджет с demurrage/dispatch расчётом
- [ ] Есть FCL/LCL cargo inquiry в sample data
- [ ] TC request классифицируется как TIME_CHARTER (не BULK)

### Smoke Test
```bash
bash scripts/smoke-test.sh
pm2 restart quantika-demo
# Дождаться загрузки → зайти на demo.quantika.org → Sample Data → проверить
```

### Cleanup
```bash
git branch -d spec/spec-00-foundation spec/spec-01-parser-fixes spec/spec-02-rate-intelligence spec/spec-03-currency spec/spec-04-subs-timer spec/spec-05-tce-calculator spec/spec-06-laytime-calc spec/spec-07-fcl-lcl spec/spec-08-integration
git push origin --delete spec/spec-00-foundation spec/spec-01-parser-fixes spec/spec-02-rate-intelligence spec/spec-03-currency spec/spec-04-subs-timer spec/spec-05-tce-calculator spec/spec-06-laytime-calc spec/spec-07-fcl-lcl spec/spec-08-integration
```
