# Acceleration Status — 2026-05-13 plan

**Last update:** 2026-05-15 (live during orchestration)
**Production deployed build:** 2026-05-14 21:10 (next-server PID 88073, **manual start, no supervisor** до takeover'а)
**main HEAD:** `5b9bf52` — включает email-persistence (#140), parse-cargo Phase 1.6 honest eval (#145), ETMS-corpus migration (#149), E2E split (workflow), dev-deps bumps, **@google/genai 2.3.0** (#115 merged 2026-05-15 07:51 UTC — мажор-апгрейд, ещё не на проде)

---

## Snapshot по потокам

### Поток 1 — Парсеры

| ID  | Задача                                        | Статус                   | Комментарий                                                                                                                                                                     |
| --- | --------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | parse-cargo eval R-current на VPS (4 прогона) | 🔴 BLOCKED               | tmux `bakeoff` (Phase 3a config bakeoff) активно использует тот же runner и `judge-cache.json` — конкуренция. Запускать после завершения bakeoff                                |
| 1.2 | Targeted parse-cargo round                    | ⚪ N/A                   | зависит от 1.1 результатов                                                                                                                                                      |
| 1.3 | Pin Gemini version                            | 🟡 PIVOTED → smoke-check | Изначальная гипотеза «alias drift 11-12 мая» НЕ подтверждена. См. ниже «Корректировки». Переориентировано в **smoke-check PR против @google/genai 2.x interface** перед деплоем |
| 1.4 | Eval-корпус parse-vessel                      | ✅ EXISTS                | `.progonq/corpus/etms-parse-vessel/` создан раньше                                                                                                                              |
| 1.5 | Eval-корпус classify                          | ✅ EXISTS                | `.progonq/corpus/etms-classify/` создан раньше                                                                                                                                  |
| 1.6 | VPS eval parse-vessel + classify              | 🔴 BLOCKED               | как 1.1                                                                                                                                                                         |

**Свежие ai_audit метрики (24h on prod):**

- PARSE_CARGO `gemini-2.5-pro` — 970 calls, **99.3% ok** ✅, $19.58, avg 31.9s
- PARSE_CARGO_JUDGE `bedrock sonnet-4-6` — 635 calls, **79.4% ok** 🔴 (20% fail: "Bedrock unable to process" + "Too many requests")
- `scope=MATCH` за 24ч — **0 calls** (нет реального user-трафика на матчинг; вызовы — это bakeoff)

**Открытое:** bedrock-судья 20% fail — в backlog (после релиза).

### Поток 2 — Скрытые страницы + UX

| ID  | Задача                                          | Статус              | PR / Branch                                                                                                                                                              |
| --- | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.A | `/laytime` + `/clauses` + `/market`             | ✅ LIVE             | merged ранее (#134 + γ-UX merge)                                                                                                                                         |
| 2.B | `/charterers` listing + detail                  | ✅ LIVE             | через γ-UX merge (PR #136 формально CLOSED, но фича в main)                                                                                                              |
| 2.C | `/vessels/[imo]/psc-history` fixture+seed+link  | ✅ **PR #152 OPEN** | `feat/psc-fixture-enable` — 21/21 новых тестов, 32/32 PSC без регрессий, tsc clean. Ждёт merge                                                                           |
| 2.D | UX cleanup (`/upgrade`, `/matches`, FuelEU)     | ✅ **PR #151 OPEN** | `feat/ux-cleanup-bundle` — 3 находки закрыты, 1 (`/recap`) выкинута как false-positive в аудите (страница работает с апреля). 16/16 новых, 0 переписанных existing tests |
| 2.E | Backend completion (Equasis, crew war bonus, …) | 🟡 DEFERRED         | решается после релиза текущего батча                                                                                                                                     |

После merge #151 + #152 + env-flags на VPS → **5/5 скрытых страниц live, 0 битых ссылок core flow**.

### Поток 3 — E2E

| ID     | Задача                      | Статус                                                                                                                                       |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1    | Browser walkthrough         | ✅ DONE 2026-05-13 (`docs/audits/browser-walkthrough-2026-05-13.md`)                                                                         |
| 3.2    | Triage                      | ✅ **этот документ**                                                                                                                         |
| 3.3a-h | Playwright suite (8 тестов) | 🟡 DEFERRED до релиза текущего батча (после merge #151 роут `/matches` поменяет поведение — тесты, написанные сейчас, придётся переделывать) |

---

## Корректировки walkthrough'а 05-13 (Task 3.2 triage)

Walkthrough делал sub-агент 2026-05-13 на проде, который тогда был старее текущего main. С тех пор прокачались PR #140/#145/#149 + γ-UX merge. Plus pin-gemini sub-агент уточнила некоторые гипотезы. Реальная картина по 5 находкам:

| #      | Walkthrough finding                                 | Severity (отчёт) | Реальный статус                                                                                                                                                                                                          | Источник правды                                    |
| ------ | --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **F1** | `/processing` 502 при AI-pipeline (VPS OOM/timeout) | 🔴 CRITICAL      | ✅ **закрыто** (memory `[Quantika Demo Acceleration 2026-05-14]`: «`/processing` 502 fixed»). На проде сейчас build от 14 мая 21:10, который содержит фикс                                                               | memory + git log по `/processing` после 13 мая     |
| **F2** | `/matches` редиректит на `/dashboard`               | 🔴 HIGH          | 🟡 **закрывается PR #151** — redirect заменён на «Coming soon» (новый `/api/matches` не создан, потому что его не было; fallback-ветка инструкции)                                                                       | PR #151                                            |
| **F3** | `/recap/[id]` 404                                   | 🔴 HIGH          | ❌ **FALSE POSITIVE** в аудите. `app/recap/[id]/page.tsx` существует с апреля, рендерит recap из session. 404 в walkthrough'е был от `notFound()` при пустой session. Реальные ссылки с `/dashboard` (line 383) работают | подтвердила D-sub-агент при перепроверке main HEAD |
| **F4** | `/market` данные устарели (3 недели)                | 🟡 MEDIUM        | 🟡 **PARTIAL** — drewry-bb seeded (#134), TMI/BHSI остались на seed-уровне. Cron sync knowledge-sources не настроен. **Отдельный backlog item** (после релиза текущего батча)                                            | git log seed-market-indices                        |
| **F5** | PSC/commission отключены флагами                    | ⚪ LOW-MED       | 🟡 **PSC закрывается PR #152**; `/commission` остаётся пустым (нет данных) — **отдельный backlog item**                                                                                                                  | PR #152                                            |

**Итого после релиза текущего батча:**

- 🔴 critical/high: 3 закрыты (F1 уже на проде, F2+F3 закрываются #151)
- 🟡 medium: 1 partial (F4 — `/market` stale, нужен cron)
- ⚪ low: 1 закрывается (#152), 1 deferred (`/commission`)

---

## Релиз-батч (готов к деплою после bakeoff)

### Что войдёт в один build + takeover

1. **Базовый main `5b9bf52`** — email-persistence, Phase 1.6 honest eval, ETMS-corpus (154 emails + 9 fixtures + 6 tests), E2E workflow split, **@google/genai 2.3.0** (мажор-апгрейд SDK)
2. **PR #151** UX cleanup — `/upgrade` placeholder, `/matches` Coming-soon, FuelEU real calculation
3. **PR #152** PSC fixture + seed + link
4. **(опционально) PR от 1.3** — gemini-v2-smoke-check (когда sub-агент закроет)

### Env-vars на VPS (`.env.local`, ручная правка перед takeover)

```bash
NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=true   # backend уже ON, UI был OFF — синхронизация
PSC_DETENTION_ENABLED=true               # для PR #152
NEXT_PUBLIC_PSC_DETENTION_ENABLED=true
```

### Seed-команды на VPS после `npm ci && npm run build`

```bash
npx tsx --env-file=.env.local scripts/seed-psc-history.ts
```

### Pre-takeover smoke checks

1. `RUN_LIVE_GEMINI_TESTS=1 npm run test:smoke:gemini` — **обязательно**, ловит интерфейсный регресс @google/genai 2.x (если sub-агент 1.3 закрыла PR)
2. `cat /proc/88073/environ` vs `.env.local` env-diff — systemd возьмёт только из EnvironmentFile, PM2 может тянуть из shell. См. `docs/ops/quantika-demo-systemd-takeover.md`
3. `curl localhost:3000/api/health` — baseline до takeover

### Takeover sequence

```bash
ssh outreach-vps "CONFIRM=YES bash /usr/local/bin/quantika-demo-takeover.sh"
```

Это: `pm2 delete` → wait 30s порт → `systemctl enable --now quantika-demo` → poll `/api/health` → auto-rollback on fail (restore `dump.pm2`).

### Точка не-возврата

После takeover `systemctl disable quantika-demo` + manual revert на старый build из git если что-то сломалось. Runbook: `docs/ops/quantika-demo-systemd-takeover.md`.

---

## Что НЕ войдёт в этот батч (deferred)

| Тема                                          | Причина                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Playwright suite 3.3a-h                       | После релиза, чтобы не переписывать под изменившийся `/matches`            |
| Bedrock judge 20% fail                        | Только eval-impact, не прод-UX. Отдельная hotfix-спека после релиза        |
| `/market` cron sync knowledge-sources         | Cron + TradingEconomics API research, не блокер MVP                        |
| `/commission` empty                           | Backend нет данных, отдельная фича-спека                                   |
| 2.E Equasis real scraper                      | Решается после релиза по результатам Поток 3 / реального демо              |
| `/root/.openclaw.pre-migration` (20G) cleanup | Ждёт твоего approve'а на удаление                                          |
| pm2-root.service backup-supervisor            | Решение: после takeover на systemd — PM2 убираем полностью, не нужен дубль |
| Parse-vessel / classify VPS eval (1.6)        | После bakeoff                                                              |

---

## Корректировки исходного брифинга (lessons learned)

Sub-агенты при перепроверке нашли два классических orchestrator bug'а у меня:

1. **F3 `/recap` false positive не отфильтрован при триаже** — walkthrough-агент 05-13 написал «404», я повторил в плане. D-агент при перепроверке main увидела что страница существует и работает. Урок: **триаж требует чтения кода, не только реdding отчёта.**

2. **Pin-gemini брифинг сшил две разные вещи** — «parse-cargo regression 11-12 мая» (на самом деле re-audit corpus, методологическая корректировка, не drift) и «Gemini model-id drift» (хардкод gemini-2.5-flash идентичен в 9 коммитах с 5 мая, drift'а не было). Реальный риск — другой: `@google/genai` 1.52→2.3 SDK мажор смержен сегодня утром, прод ещё не получил. Sub-агент переориентировала задачу на правильный риск (smoke-check). Урок: **проверять архивные memory-факты против git log перед написанием спеки.**

Эти корректировки уже встроены в текущий план.

---

## Open questions

- **Когда запускать takeover?** Зависит от bakeoff. Контроль через `ssh outreach-vps "tmux capture-pane -t bakeoff -p | tail -10"` — когда увидим финальный «[bakeoff] done» либо отсутствие нового раунда более 2 часов.
- **`/root/.openclaw.pre-migration` 20G — удалять?** Не из whitelist F-сессии, ждёт твоего OK.
- **Активация `NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=true` — все ли backend-данные готовы?** В backend флаг ROI_GUARANTEE_ENABLED уже true, виджет должен показаться. Smoke в proddшний build чек после takeover.
- **Wave δ kickoff?** По плану — финальная wave после сходимости трёх потоков. После релиза текущего батча и Playwright suite — соберём ROADMAP-wave-delta из deferred-items и оставшихся walkthrough-finding'ов. Не в ближайшие дни.

---

## Definition of Done — overall

- [x] 4/5 скрытых страниц live (laytime/clauses/market/charterers)
- [ ] 5/5 скрытых страниц live (PSC через #152 + env-flag + seed)
- [ ] 0 битых ссылок core flow (`/upgrade`, `/matches` через #151)
- [x] parse-cargo стабилен (99.3% ok за 24ч)
- [ ] parse-vessel / classify eval ≥ 94/95 (после bakeoff)
- [ ] Playwright suite 8/8 в CI (после релиза)
- [ ] systemd supervisor на проде (через takeover)
- [ ] Wave δ merged + deployed
