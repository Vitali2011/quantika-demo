# Wave β Fixes — Out-of-scope / Deferred to wave-γ

## Deferred bugs (NOT touched in claude/wave-beta-fixes)

| Bug | Source | Severity | Reason deferred |
|---|---|---|---|
| BUG-04 daily_tce inflated $60k | smoke | HIGH | Derived bug — закроется автоматически после fix BUG-βf-03 (DA) + 04 (war_risk). Re-test после deploy. |
| BUG-10 L5C alias "wheat in bags" | smoke | HIGH | Dataset expansion — нужен product-call по списку алиасов на CN/PL/RU/AR. |
| BUG-11 L5C coverage 10→200+ pairs | smoke | HIGH | Dataset — wave-γ scope. Нужен Lloyd's/Britannia матрицы. После spec-βf-02 (fail-closed) unknown pairs хотя бы безопасны. |
| BUG-12 DRI extra_clean flag | smoke | MEDIUM | Data nudge. |
| H1 parse-cargo 524 (post-fix re-test) | browser | HIGH | Re-test после spec-βf-11. |
| H2 /matches route 404 | browser | HIGH | UI design call (sort, detail, modal). |
| H3 β-05..β-13 missing UIs | browser | HIGH | Massive UI scope: VoyageBreakdownChart, Suez vs Cape modal, CII badge, L5C UI, Sanction badge, Subs badge countdown, Plan-First gate, Gmail sidebar (Chrome ext separate), FAB voice. → wave-γ. |
| H4 CARBON LADY post-fix re-test | browser | HIGH | Re-test после spec-βf-12. |
| H5 WYWA card | browser | HIGH | Feature flag + design call. |
| C3 Market Intelligence 503 | browser | CRIT | TOEPFER/BHSI keys missing на VPS env. **Ops issue**, не code. Решение: либо seed keys (если provider account есть), либо graceful degradation UI spec в wave-γ. |
| BUG-β-09-NormalizeStripsName | adversarial | MEDIUM | Sanctions false-negative — hard to test без real corpus. |
| BUG-β-06-WinnerSavingsMismatch (rest) | adversarial | MEDIUM | Partially closed by spec-βf-06; remaining axis-mismatch — defer. |
| BUG-β-05-EuLegPercentNoClamp | adversarial | MEDIUM | Defensive — UI sends 0..1 правильно today. |
| BUG-β-01-DatalasticKeyInQuery | adversarial | MEDIUM | Secret-leak via logs. **Ops fix** (proxy log scrubber), не code. |
| BUG-β-stab-01-BunkerPriceParse EU thousands | adversarial | MEDIUM | EU locale `1.234,56`. |
| BUG-β-10-SubsRaceCondition | adversarial | MEDIUM | Concurrent cron + manual trigger. Real risk но low frequency. |
| BUG-β-12-ScoreCap22 (LOW) | adversarial | LOW | Cosmetic — max total = 97/100 not 100. |
| BUG-β-12-DollarRegex (LOW) | adversarial | LOW | `\b\$\d+` regex gap. |
| BUG-β-06-DeadCostsBranch (LOW) | adversarial | LOW | Dead code branch. |
| Browser UX nitpicks 1-8 | browser | UX | Mobile 375px Inbox cramped, 404 page unbranded, onboarding redirect to `/`, "Good morning, Broker", sample-04 "0mts" silent pass, raw ISO timestamps, no back nav, retry button silent fail. → wave-γ UX polish. |

## Open product questions

1. **MPP enum scope (BUG-βf-05)** — пока добавлю minimal `mpp` + `general` (default fallback). Расширение на `heavy_lift`/`ro_ro` — нужен product-call. → spec-βf-05 минимально, остальное defer.
2. **C3** — seed TOEPFER_API_KEY/BHSI_API_KEY на VPS, или graceful UI? → ops question, defer.
3. **L5C dataset** — кто owner матрицы? Какой источник правды (Lloyd's, Britannia, NK)?
