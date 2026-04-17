# Phase 2 — Implementation

## Changed Files
- `lib/sailing/port-distances.ts` — ESM import fuzzysort; добавлены imports PORTS_JSON + loadPortMasterFromJson + PortMaster type; `getFuzzyCorpus()` расширен JSON-инъекцией всех 435 портов; `_setFuzzyCorpusForTest` переименован в `setFuzzyCorpus`; stale "Phase 5 will ..." JSDoc комментарии удалены; `Array.from()` добавлен для совместимости с downlevelIteration
- `lib/sailing/__tests__/port-distances.test.ts` — новый describe-блок `normalizePortName — JSON-only ports (port-master corpus)` с тестом `fuzzy-matches Fos-sur-Mer with dropped letter to canonical JSON name`

## TDD Proof
- **RED commit** `7016f69`: тест `normalizePortName('Fos-sr-Mer') → 'Fos-sur-Mer'` добавлен → FAIL (received null, порт не в corpus)
- **GREEN+REFACTOR commit** `94bac36`: реализация JSON-инъекции → PASS. Все 876 тестов зелёные.

## Test Results
- Before: 875 passed (49 suites)
- After: 876 passed (49 suites)
- New test: `fuzzy-matches Fos-sur-Mer with dropped letter to canonical JSON name` in describe `normalizePortName — JSON-only ports (port-master corpus)`

## Self-Check
- [✅] JSON port injected into corpus (все 435 через loadPortMasterFromJson)
- [✅] ESM import fuzzysort (`import fuzzysort from 'fuzzysort'`)
- [✅] `_setFuzzyCorpusForTest` → `setFuzzyCorpus` everywhere (grep подтверждён: 0 старых вхождений)
- [✅] Stale Phase 5 comments removed (JSDoc + inline комменты)
- [✅] No new `require()` for fuzzysort in port-distances.ts (остались только haversine/port-master lazy require для circular dep prevention)
- [✅] Lint 0 warnings
- [✅] Build green

## Key Decisions
- **Typo choice:** изначально выбрана подстановка `u→o` (`Fos-sor-Mer`), но fuzzysort — subsequence matcher, не edit-distance. Подстановки не матчатся. Переключился на dropped-letter тип: `Fos-sr-Mer` (drop 'u') — score ~0.347 > threshold 0.3.
- **downlevelIteration:** `PortMasterIndex extends Map<>` — итерация `for...of map.entries()` вызывает TS error. Решение: `Array.from(portMaster.entries())`.
- **Threshold:** оставлен 0.3 без изменений. Регрессий нет — все 875 старых тестов прошли.

## Known Limitations
- Fos-sur-Mer и другие JSON-only порты не имеют distance pairs в DISTANCE_TABLE — `getPortDistance()` вернёт haversine fallback или null. Это ожидаемо (graceful degradation).
- Fuzzysort — subsequence matcher: подстановки букв (u→o) не матчатся. Только пропуски/перестановки.

## Commits
- `7016f69` — test(port-distances): RED — fuzzy match Fos-sur-Mer (JSON-only port) with typo
- `94bac36` — feat(port-distances): inject port-master.json corpus into fuzzy matching (Phase 5)
