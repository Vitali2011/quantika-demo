# Plan: HOTFIX «a.match is not a function» — non-string в restrictions (2026-06-01)

## Goal (HOT — юзеру падает /match для части матчей)
Страница матча крашится на ДЕФОЛТНОЙ вкладке Vessels: VesselsTab parseCiiDorE() зовёт r.match() на каждом элементе restrictions; если элемент НЕ строка (объект/число от LLM-парсера) → «a.match is not a function» → «Something went wrong». Фикс H1: фильтровать restrictions до строк (корень) + guard на краш-сайте (defense in depth, чинит уже засеянные битые записи БЕЗ пересева).

## ⚠️ Orchestrator override (конфликт-авоиданс)
Спек включал п.3 EconomicsTab.tsx parseLeadingNumber (H2) — НЕ делать в этом PR: EconomicsTab правит параллельная сессия Econ №2 (econ-distance-compare). H2-guard будет добавлен в Econ-эпопее (тот же файл + Econ №2 добавляет numeric speed/consumption, где guard и нужен). Здесь — ТОЛЬКО H1.

## Changes (2 файла + тесты)
1. КОРЕНЬ — `lib/parsing/parse-vessel-helpers.ts` (~стр.267): где `restrictions: Array.isArray(item.restrictions) ? item.restrictions : []` → добавить фильтр типа:
   `restrictions: Array.isArray(item.restrictions) ? item.restrictions.filter((x) => typeof x === 'string') : []`
2. КРАШ-САЙТ (defense in depth) — `components/match/VesselsTab.tsx`:
   - parseCiiDorE (~стр.20): в начале итерации по элементу — `if (typeof r !== 'string') continue;` ПЕРЕД r.match().
   - рендер списка restrictions (~стр.57): пропускать не-строки (filter typeof==='string') — иначе React «Objects are not valid as a React child».

## Tests (TDD, RED→GREEN) + /test-skill (risk-override parser/validator — ОБЯЗАТЕЛЕН)
- Regression: ParsedVessel с restrictions=[{x:1}, 123, "no grain"] → VesselsTab рендерится без throw; parseCiiDorE возвращает корректно (не падает); в рендере видна только "no grain".
- parse-vessel-helpers: вход restrictions с не-строками ([{},5,"x"]) → на выходе ТОЛЬКО строки (["x"]).
- Не сломать существующие parse-vessel-helpers тесты (restrictions со строками проходят как есть).
- npx jest зелёное, tsc clean.

## Out-of-scope
- НЕ трогать EconomicsTab.tsx (H2 → Econ-эпопея, конфликт с in-flight Econ №2).
- НЕ трогать движок/scoring/Fit Score/worksheet/MatchDetailPanel.
- Пересев seed НЕ запускать (краш-сайт guard делает UI устойчивым к битым данным без пересева; root-фикс чистит будущие парсы).

## Verify
- npx jest + tsc. PR в main: "fix(match): guard non-string restrictions — hotfix a.match crash on Vessels tab".
- Gate3 preview: открыть ранее падавший /match/28808 — рендерится. Gate5 founder.
