# Quantika Demo — ROADMAP (Текущее состояние)

**Последний полный аудит:** 2026-05-17 (5-поточный код-аудит) + 2026-05-19 UI audit (Playwright+Chrome MCP) + **2026-05-19 ROADMAP reality audit** (claim vs prod sweep)
**Последнее обновление:** 2026-05-25 (день, wiring pass) — **🔌 POST-REDESIGN BACKEND WIRING COMPLETE**. 4 gap'а закрыты: Settings save endpoints (#449), AIBar email-paste flow (#457), Generic toast system (#458), Mode-aware content charterer↔owner (#459). Все 4 QA PASS, auto-deploy LIVE.
**Текущая версия:** prod HEAD `5f936af` (toast system, последний merge) auto-deploy LIVE на outreach-vps
**Статус:** 🟢 Production-quality SaaS UI + backend wiring ~90%. Открытые followup: (1) rate-limiter `/api/parser/email` (MEDIUM, non-blocking), (2) Mode M1 = UX-choice (принято), (3) R6.5 dark-mode toggle, (4) components/ui 40 stale imports.

> **Живой документ.** Заменяет `ROADMAP-SESSION-PROMPT.md` (тот был разовый промпт-генератор, не state tracker).
> Источники отчётов: `/root/orchestrator-state/audit-2026-05-17/{parsers,data,api,ui,waves}.md`

---

## Краткая сводка

Quantika Demo прошла **Wave α → β → βf×3 → γ (Scale + Vertex + Knowledge Layer)** за апрель-май 2026. Стабильно в проде, 5570+ тестов зелёные, **17 PR слиты за день 2026-05-17** (12 утром + 5 вечером).

**Wave α MVP scope = 12 ✅ / 5 🟡 / 0 ❌.**

**Что изменилось за 2026-05-17:**

- ✅ Hot-restore env-incident (`.env.local` truncated, prod молча тлел 22h)
- ✅ Data layer полностью оживлён (RAG=141 chunks, market_indices=90, charterers=20, port_da=94, psc=16, distances=17985, roi_metrics=18, fx_rates=200)
- ✅ Все 8 γ-флагов активированы (γ-02/03/05/08/09/11/18/01)
- ✅ Bedrock Opus 4.7 заменён на claude-cli (наша Opus подписка) — экономим $15/$75 per 1M tokens
- ✅ Backup cron + inotify watchers + searoute systemd live
- ✅ 4 tracking issues #177-180 закрыты (#180 deferred как нерелевантный)
- ✅ parse-cargo GT нормализован (PR #197, 43 fixtures)

**🎯 Стратегия моделей (актуализация 2026-05-17 поздний вечер):** код миграции на Gemini уже сделан (Wave γ, 2026-05-05). На проде AI_PROVIDER=gemini + MATCH_PROVIDER=gemini → **7/7 scopes через Gemini default**. claude-cli остаётся для eval judge. Сейчас в отдельной user-сессии идёт bake-off конкретных Gemini моделей per parser. Подробности в §1.1.

**Что изменилось за 2026-05-21:**

- ✅ **#298** parse-vessel R5 — open_date no-year-inference + display title-case
- ✅ **#300** fix eval runner — M/V normalization + ex-name strip + null ref tolerance
- ✅ **#302** ci: pre-merge-guard workflow [deploy-affects] LIVE — блокирует merge без явного approve для deploy-affects PR
- ✅ **#303-#307** parse-vessel eval fixes — best-match pairing, LLM flag equivalence, edge-case coverage, MAX_BODY_CHARS 5000→8000, maxTokens 16384
- ✅ **#308** parse-vessel R7 — flag normalization, TC vessels, subject DWCC, TBN dedup, SSL format
- ✅ **#309** fix maxTokens 16384 + schema maxLength + judge error fix
- ⚠️ **#310 REVERT** — M2-O prompt changes вызвали -13 регрессию (R7→R8) → reverted; нужна новая стратегия
- 📋 **parse-vessel** — в активной итерации, R8 baseline после revert; следующий шаг: анализ что именно регрессировало

**Что изменилось за 2026-05-21 (вечер):**

- ✅ **#319** feat(bimco): C1a — +4 charters (NYPE 1946 +12 clauses, SHELLVOY 6 +10, BALTIME +1 summary, CONGENBILL +1 summary); bimco_vec 7→31 rows fresh; FTS retrieval verified "NYPE time charter" returns relevant chunks
- ✅ **#318** docs(superpowers): C1 RAG shipping refs expansion design spec (master design for C1a/b/c sub-specs)
- ✅ **#317** feat(matches): M3 bulk actions polish — filter persistence + select-all + CSV export
- ✅ Prod RAG refresh BIMCO via `scripts/knowledge/cron/refresh-bimco-rag.ts` (Vertex AI working на новом GCP project `quantika-demo-496307`)
- 🛠 **Infra knowledge captured:** `~/orchestrator-state/quantika-demo/prod-snapshot-2026-05-21.md` (hosts/services/DB/GCP/refresh patterns) + memory `reference_quantika_prod_infra.md`
- ⚠️ **GCP discovery:** old project `quantika-demo-2026` decommissioned (CONSUMER_INVALID на dev-vps); new prod project `quantika-demo-496307` working на outreach-vps
- 📋 **Open follow-ups:** #316 D1 post-deploy verify [deploy-affects] — manual review pending; auto-merge BLOCKED race condition (workaround `--admin`); auto-rebase workflow timing issue

**Что изменилось за 2026-05-22:**

- ✅ **#322** fix(auth): F7 /processing 403→200 для demo_auth-only users — auth gap закрыт
- ✅ **#324** docs(parse-vessel): R8 regression root-cause analysis — вывод: -13 была measurement artifact (тест-паринг алгоритм), **не регрессия промпта**; R8 baseline валиден
- ✅ **#323 + #327** feat(cron)/fix(ops): C5 fx_rates — systemd timer daily 03:00 UTC LIVE на prod (212 rows загружено); User=root fix (npx tsx pattern согласован с prod)
- ✅ **#326** fix(parse-vessel): R15 — 5 сценариев (sc-002/003/031/034/040) исправлены; eval 56/56 = **100%**
- ✅ **#328** fix(ci): auto-merge BEHIND race — workflow_dispatch вместо git-nudge; auto-rebase open PRs on main push LIVE
- ✅ **#316** feat(ops): post-deploy verify script + CI HTTP health step — merged
- ✅ **Wave 3 — Parser quality (#331/#332/#333/#334)** — 3 параллельные сессии:
  - **draft-quote #331** — R0 6/6 fail → **R3 6/6 PASS** (3 раунда prompt-правок)
  - **explain-deal #332** — R0 6/6 → **R1 11/11 PASS** (корпус 6→11 + Arabic fix)
  - **match #333** — **R7 0/25 fail** (+8 Iskenderun distance pairs; distance-matrix C3 = docs-only)
  - **#334** — §1.1 обновлён реальными числами (был stale «нет baseline/eval»)
- 📋 **Parser quality итог: 4/7 парсеров готовы** (parse-vessel, match, explain-deal, draft-quote). parse-cargo стабилен (R5 marginal). **2 заблокированы на данных партнёра** (см. ниже).
- 🔴 **classify (urgency 70.8%) + parse-recap (45-58%) — ждут данных от партнёра.** Опросник готов: `~/quantika-partner-questionnaire.md` (MacBook, лёгкая версия). Нужно: (1) ~10 реальных recap-писем; (2) 15-20 писем с меткой URGENT/NORMAL/LOW. После получения → калибровать обе модели до 95%+. **Следующая сессия начинается отсюда.**

**Что изменилось за 2026-05-22 (итог дня):**

- 🚨 **ИНЦИДЕНТ+ФИКС auto-deploy:** прод застрял на #334 — git был на ветке `docs/flag-activation`, не `main`; `GITHUB_TOKEN` не триггерил `deploy.yml`. Фикс: прод переведён на `main` + ручной деплой; deploy-триггер починен **#344** (auto-merge через `AUTO_REBASE_PAT`). Прод теперь на **#338**, health 200. ✅
- ✅ **ECA live:** `eca_zones` было 0 — парсер не понимал `polygon_geojson`. Фикс парсера **#338** + seed на проде → `eca_zones=4` LIVE. ECA топливная надбавка для EU/North Sea рейсов заработала (раньше молча возвращала 0).
- ✅ **#336** — 73 route-теста, 0 багов (baseline coverage audit)
- ✅ **#337** — ai-grounding аудит: 9 галлюцинаций в `explain-deal` Market Context (3 сценария)
- ✅ **#338** — data-integrity аудит 21 таблицы + eca parser fix; `/test-skill` поймал BUG-1 (`Array.isArray`), пофикшено в рамках PR; результат 57/57
- ✅ **#340** — data source-of-truth: env-aware аудит + prod→dev snapshot + seed inventory
- ✅ **#344** — deploy-trigger fix (AUTO_REBASE_PAT вместо GITHUB_TOKEN)
- ✅ **#345** — nav: Market link на /dashboard + active state в BottomNav
- 📋 **IN-FLIGHT** (open PR, валидируются): **#341** (market real-data + systemd timer + UI «as-of-date»), **#342** (matches auto compute+persist догоняющий триггер + UI + E2E poll), **#343** (parse-cargo: `cargo_description` 15.5%→85% +69pp, commission +6.8pp)
- 📋 **НАХОДКИ:** EU-санкции на проде в порядке (5,996 rows — аудит мерил dev-базу, была ложная тревога); `data-integrity` вердикты: `market_indices` + `war_risk` требуют внимания; eval judge = `claude-cli` (не Haiku); overflow работает без Gemini
- 📋 **BACKLOG:** ~95 устаревших worktree (cleanup); старые open PR **#276** (parse-vessel, DIRTY) и **#299** (docs) — решить судьбу

**Что изменилось за 2026-05-22 (поздний вечер — addendum):**

- ✅ **PR-финал дня (merged):** #336 / #337 / #338 / #340 / #341 / #342 / #343 / #344 / #345 / #346 / #299. Closed: **#276** (parse-vessel superseded R16) и **#339** (заместил #342).
- ✅ **#341 market real-data + systemd timer + UI «as-of-date» LIVE** — auto-merged успешно, НО auto-deploy **НЕ** сработал (см. инфра-долг ниже) → задеплоен **ВРУЧНУЮ** на prod. Итог: Market UI показывает «по состоянию на <дату>»; systemd-таймер `quantika-market-indices-refresh` установлен и active (авто-рефреш ежедневно). Nav-кнопка **#345** Market Intelligence → «View all» live в `/dashboard`.
- ✅ **Worktree-гигиена:** ~120 → 9 (root@ 5 + mikanovich@ 4); удалено **66 + 13 + 21** устаревших worktree.
- 📝 **Process notes:** eval judge = `claude-cli` (не Haiku); overflow работает без Gemini → parser-eval запускается на root@.
- 🔴 **ОТКРЫТЫЙ ИНФРА-ДОЛГ (приоритет №1 следующей сессии): AUTO-DEPLOY TRIGGER СЛОМАН.** Auto-merge работает, но `deploy.yml` НЕ триггерится при завершении GitHub native auto-merge (merge атрибутируется боту, а не `AUTO_REBASE_PAT`). PR **#344** (`GITHUB_TOKEN → AUTO_REBASE_PAT`) НЕ решил полностью. Нужен настоящий фикс: `workflow_run`-триггер после CI на main **ИЛИ** `repository_dispatch` из auto-merge workflow. Пока не починено — каждый merge требует **РУЧНОГО деплоя**, прод отстаёт от main.

**Что изменилось за 2026-05-20:**

- ✅ **B5a #288** — pre-populated searoute JSON (tier 2): 105,011 пар, canal routes 32-163% точнее haversine
- ✅ **B5b #289** — on-the-fly searoute-ts (tier 3): LRU cache 10K entries, ~30-50ms cold / <1ms warm
- ✅ **#295** — создана `/more` page + рабочая кнопка Logout (POST /api/auth/logout → /login)
- ✅ **#296** — /matches session fix: sample data flow теперь корректно распознаётся guard'ом (`isSampleData` flag)
- ✅ **#297** — aria-valuetext формат исправлен ("0 %" → "0%") + SAN badge overflow на 375px мобильном
- ✅ **#299** — design docs committed (qa-walker-design.md + searoute-integration-design.md)
- ✅ **ops #28/#29/#48** — AUTO_REBASE_PAT verified, nudge CI working, deploy.yml documented; subagent template RC-D: PR title MUST contain [code-only]
- ✅ **Distance QA** — 9111/9111 тестов PASS, tier ordering verified (tier 1 > tier 2 > haversine)

**Что изменилось 19 мая (match parser baseline saga — 5 PRs):**

- ✅ **#235** eval harness — 11-scenario corpus + runner + judge для match parser (последний без eval)
- ✅ **#236** hard-filter cargoWeight — DWCC×1.05 reject, физически невозможные пары больше не идут в LLM
- ✅ **#237** readiness=unknown fix — port hints (Hereke→Marmara) + date object handling ({open,close,display})
- ✅ **#239** corpus calibration — R0 expected → R1 reality (3 → 5 no-match scenarios, S1/M2/W2 reclassified)
- ✅ **#240** port DB coverage +10.8pp — 40 aliases + 4 ports (Nemrut→Aliaga, Pivdennyi→Yuzhny etc.), broker corpus resolution 57.3%→68.1%
- ✅ **R0→R2 wins:** no-match hard-filter 0/2→5/5 PASS; W3 (5 mo late) score 47.8 possible → 34.8 weak; M1 top match 62.8 → 70.6 good (readiness ideal gap 2.33d); 0 hallucinations через 3 итерации
- 📋 **6/11 scenarios всё ещё readiness=unknown** — distance matrix gaps (Marmara↔Aliaga, Red Sea→Iskenderun, Ravenna→Izmail) — Phase B candidate
- 📋 **W1 (60-day idle)** всё ещё score 60.6 possible — idle penalty smell в match-scoring.ts — Phase B candidate

**Что изменилось 18 мая (parser audits wave + M1):**

- ✅ **15 PR merged** по парсерам: schema/prompt audits, eval harness recap, dedup для vessel hallucination, hotfix unknown_terms, surface 5 schema fields, UI display
- ✅ parse-vessel **dwcc 51.9%→94.9%, open_position 19.7%→92%, open_date 27.7%→91.1%** (был silent-null months из-за schema rename)
- ✅ parse-cargo cargo 91.8% / laycan 93.2% (GT normalization waves)
- ✅ parse-recap eval harness built, baseline 55.8% (noisy на 3 scenarios)
- ✅ /matches: M1 + M3 LIVE — MATCHES_ENABLED=true выставлен 2026-05-19, rebuild + systemctl restart
- ✅ 3 missing webhook routes добавлены в AUTH_BYPASS (PR #221) — после rebuild на правильном хосте outreach-vps работают
- 🟡 Discovered: prod = outreach-vps (NOT dev-vps); 14 PRs не были на проде до systemctl restart

**Что изменилось за 2026-05-23 (4-волновой план — 7 PR за утро):**

- ✅ **W0**: #365 `match Phase B` (distance corridors Izmail-Ravenna/Iskenderun-Jeddah + tiered idle penalty tests, QA cold PASS 0/0) + #366 docs/audits/mobile-ux-2026-05-22.md (16 findings, 7 экранов)
- ✅ **W1 (parallel × 3 + 2 cold-QA)**: #367 `fix(middleware): 401 JSON for /api/*` closes **#364** (auth-risk, /test-skill PASS) · #368 `feat(cargo-detail): quantity + laycan AI fields` closes **#361** · #369 `fix(fueleu): correct compliance badge — WtW > target is non-compliant` closes **#359** (logic-risk, /test-skill PASS)
- ✅ **W2**: #370 `fix(ux): mobile polish — H-2/H-3/H-4/H-5` — 8 touch-targets /matches на ≥44px, bulk-footer clearance BottomNav, /upgrade в /more nav, /more populated (Upgrade/Dashboard/Help/Logout). H-1 prod build-gap закрылся auto-deploy'ем W0/W1
- ✅ **W3**: #371 `fix(cleanup): LOW mass-cleanup` closes **#360** (benchmark link 404 → http:// guard) + **#362** (SANCTIONS badge mistag → pair-analyzer primary-cause filter) + **#363** (sitemap.xml 404 → public/robots.txt + sitemap.xml) + audit LOW L-1/L-2/L-3 (RU empty-state, design tokens на /upgrade, safe-area на /more)
- 📋 **Autonomous wave-driver**: 4 волны выполнены через cron-loop (CronCreate каждые 15м → dispatch.sh → tmux fire-and-forget → done-watcher → wake), zero-touch после первой команды. Конфликт на /more/page.tsx между W2 (nav links) и W3 (safe-area) резолвлен оркестратором inline.

**Что закрыто финально (2026-05-24 ~09:30):**

- ✅ **#430 hydration src-3** (MatchesClient.tsx toLocaleString без locale — Node SSR vs browser разные разделители; pin 'en-US'). 3-я и финальная итерация #418-цепочки.
- ✅ **qa-walker run #6: 0 errors** — все 3 hydration источника закрыты, prod stable.
- 📋 **Cleanup:** 22 worktrees → 5; 2 merged branches deleted.

**Что изменилось за 2026-05-24 (день — экономика match LIVE):**

- ✅ **#424 parse-cargo R28** — K-suffix + 1H/2H/EOM laycan + 6 port abbreviations + 15 synthetic scenarios. Prompt iteration с R27 baseline 91.8/93.2/91.6%.
- ✅ **#425 #404 hydration source-2** — SourceTable + charterers/[id] toLocaleDateString без timeZone давали SSR mismatch. Pin UTC + 2 regression tests.
- ✅ **#427 distance_nm populate gap** — UNLOCODE fast path в normalizePortName. distance возвращал NULL для 95% matches (UNLOCODE CNSHA не матчился к 'Shanghai'). 803/803 green, cold-QA 0 CRIT/HIGH/MED.
- ✅ **#428 TCE feature** — estimateFreightRate (baseline по cargo class × distance factor) + migration 036 + PATCH manual override + UI input. Match Economics теперь non-NULL TCE для большинства matches. 13 файлов, cold-QA PASS (2 MED follow-ups: storedFreightRate badge refresh).
- 📋 **Бизнес-итог:** брокер открывает /matches → видит cargo/ports/laycan/dwt/distance/TCE сразу + может править ставку в Economics tab → пересчёт. Реальная economic snapshot, не demo placeholder.
- 📋 **TCE follow-ups (LOW):** (a) Baltic live rates puller вместо statics; (b) UX badge refresh after manual override.

**Что изменилось за 2026-05-24 (утро — qa-loop iter 1 + iter 2 COMPLETE):**

- ✅ **qa-walker iter 1** нашёл 6 новых: #413 (root: stale chunks 500 от duplicate Constanta|Marghera) + #414 logout regression + #415/#416/#419 cascade от #413 + #417 /more 404 + #418 /upgrade 404.
- 🚨 **PROD INCIDENT (~10 мин downtime):** prod build упал на TS duplicate property → .next пустой → systemd crash-loop. Hotfix: SSH outreach-vps, sed remove дубли, NODE_OPTIONS rebuild, systemctl restart. Восстановлено HEALTH 200. PR #420 зафиксировал в git.
- ✅ **iter 1 fix-wave:** #420 (dedup, hotfix prod) + #421 (#414 logout regression guard) + #422 (#417 #418 /more+/upgrade nav). Cascade #415 #416 #419 закрыты verified.
- ✅ **qa-walker iter 2 PASS — 0 CRIT/0 HIGH open.** Все qa-walker issues закрыты. #395 #418 false-positives закрыты verified. Loop STOP.
- 📋 **Lessons:** (1) Phase B + Match conflict не пойман CI (duplicate TS keys) — добавить pre-merge TS check; (2) rm -rf .next перед rebuild = риск, better blue-green deploy с .next.new directory.
- 📋 **INFO non-blocking:** /market показывает данные as of 2026-05-14 (10 дней stale) — systemd timer #341 не триггерил pull с 2026-05-22.

**Что изменилось за 2026-05-24 (раннее утро — qa-walker re-test wave 2):**

- ✅ **W1 SECURITY** #406 (#399 cargo_type filter снимал session_id WHERE → cross-session leak): 3 edits route.ts + 7 PI2 isolation tests. /test-skill PASS 0 CRIT / 0 HIGH (cross-session, SQL inj, auth bypass, timing, NULL, empty, replay), 1 LOW non-exploitable.
- ✅ **W2** #407 (#401 migration 035 TCE+distance_nm), #408 (#404 SubsCountdownWidget useMemo→useState hydration #418 — новый source после #357), #409 (#400 /match/[id] page + GET /api/matches/[id]).
- ✅ **W3** #410 (#402 BHSI ORDER BY DESC — был oldest вместо newest), #411 (#403 EUA price в EconomicsTab + N/A fallback + stale marker).
- 📋 **Match Phase B advanced #405** (был утром): corpus 25→39 100% (15 distance pairs + 2 aliases + 14 scenarios).
- 📋 **Q002 deferred:** matches listMatches() defense-in-depth (non-exploitable, internal fail-safe для cross-session, никакого пути эксплойта в коде).
- 📋 **Next:** /qa-walker LOOP iter 1 — Playwright против prod чтобы проверить что 6 свежих фиксов + старые не регрессировали.

**Что изменилось за 2026-05-23 (поздний вечер — Wave A2 hotfix):**

- ✅ **#396** fix(emails): sample-data shortcut bypasses Gmail OAuth (#394) — наш предыдущий #384 покрыл status 500→401 + cleanup, но sample-mode всё ещё ходил в OAuth. Detect server-side session → пропуск OAuth → load fixtures. 3 PI2 tests + cold-QA PASS.
- ✅ **#397** fix(matching): populate M3 fields in demo seed match (#393) — наш #383 покрыл runtime computeAndPersistMatches, но «Guaranteed demo match for EconomicsTab» seed creator писал hardcoded row с NULL. Extracted persist-session-matches.ts helper (same pattern), seed теперь populates cargo_type/load_port/discharge_port/vessel_dwt/laycan. Bonus: parseLaycan accepts «..» separator. 4 PI2 + cold-QA PASS.
- 📋 **Lesson:** qa-walker re-test нашёл оба узких фикса. Pattern: fix root cause widely (cover ВСЕ creators того же класса), не один путь.

**Что изменилось за 2026-05-23 (вечер — qa-walker 4 waves, ~4ч автономно):**

- ✅ **Wave A (CRITICAL):** #383 (#378 matches NULL fields — root cause: 6 columns миграции 033 не передавались в createMatch) + #384 (#376 /api/emails/fetch 500 на 2-м запуске — stale Gmail OAuth state, logout cleanup). Оба /test-skill PASS.
- ✅ **Wave B (HIGH /matches UI):** #385 — 5 issues одной веткой (#375 overflow, #374 bulk toolbar, #373 filter dup, #350 sort, #348 clickable cards) + bonus #349 cargo/route/dwt display из #378 fields. 168/168 green.
- ✅ **Wave C (HIGH data/security):** #386 (#377 BHSI/TOEPFER live из market_indices + stale marker) + #387 (#354 TMI outlier marker + #353 RU→EN labels) + #388 (#355 server-side XSS sanitization, /test-skill 29 adversarial vectors 0 VULN).
- ✅ **Wave D (LOW polish + verify-close):** #389 — 4 fixes (#357 hydration, #356 email dup, #351 Quote draft generator, #352 logout verified) + 6 verified-close (#294 #291 #292 #293 #362 #352). 21 qa-walker issue из 22 закрыто.
- ✅ **#391** Q001 закрыт — 3-line patch в middleware.ts (AUTH_BYPASS_PATHS += /sitemap.xml + /robots.txt). **22/22 qa-walker issues закрыто за день.**

**Что изменилось за 2026-05-23 (день — 3-параллельных, ~1.5ч):**

- ✅ **#380** test(api): coverage для 3 untested routes — 50→53/53 (100%), 20 новых тестов (auth-google, extension-draft, whatsapp-ingest/webhook). PI3 compliant.
- ✅ **#381** fix(match): Phase B v2 — 2 port aliases (aliağa/petkim → Aliaga) + 8 distance pairs. **W1 root-cause:** Novorossiysk|Piraeus=895nm missing → readiness=unknown → score 60.6 possible. Fixed → idle penalty -35 → score≈31 weak. 25/25 evals + 348/348 tests. /test-skill PASS (0 CRIT/0 HIGH, 1 LOW cosmetic).
- ✅ **#379** fix(matching): MED-01 align — applyReadinessScoring → deriveMatchLevel (1-line, ≥70/≥40 boundary consistent). 101/101 green. /test-skill PASS (0 CRIT/0 HIGH).
- 📋 **Roadmap backlog обновлён:** №3 route tests = ✅, №4 Match Phase B core (port+distance+idle) = ✅, №5 MED-01 = ✅. Остаются: Sentry/UptimeRobot setup (UptimeRobot ждёт Vitali регистрацию), parser calibration (партнёрские данные).

**Что ещё блокирует pre-PMF:**

- ✅ **roi_metrics + fx_rates** — закрыто 2026-05-22 (C4 seed 18 строк + C5 daily timer 03:00 UTC, см. §2 Закрытые)
- 📋 Match parser Phase B — port-master extensions + distance matrix + idle penalty calibration (R2 baseline ready, 6/11 residual readiness=unknown)
- 📋 Recap corpus expansion 3→30 (waiting real recap emails в Gmail)
- 📋 Classify urgency criteria (GT inconsistent, нужен annotator)
- 📋 UX polish (mobile bottom nav, /upgrade заглушка)

**Следующие 7 дней:** webhook auth + parser quality + UX polish.
**Следующие 30 дней:** mobile-first feature pages + monitoring (Sentry/UptimeRobot).
**Следующие 90 дней:** PWA + Arabic RTL + Quote PDF + Stripe billing — путь к первым 10 платящим клиентам.

---

## 1. Статус по доменам

### 1.0 UI Audit Findings (2026-05-19)

**Метод:** Playwright headless × 24 страниц × 2 viewport (desktop 1920×1080 + mobile 375×667) на проде `https://demo.quantika.org`, login через DEMO_AUTH_PASSWORD из outreach-vps `.env.local`. Sсript: `/tmp/audit-quantika-demo.js` (см. `docs/superpowers/specs/2026-05-19-ui-audit-design.md`).

**Результат:** 48 entries — 40 🟢 / 6 🟡 / 2 🔴. Real picture после deep-dive более существенная — **4 критических env drift'а + auth model gap**.

#### ✅ Critical drifts — все закрыты (verified 2026-05-19 reality audit)

| #      | Claim                   | Prod reality (verified 2026-05-19)           | Status                                                       |
| ------ | ----------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| **F1** | `AI_PROVIDER=gemini`    | ✅ `AI_PROVIDER=gemini` в `.env.local`       | ✅ RESOLVED — chip-сессия 2026-05-19 закрыла manual env edit |
| **F2** | `MATCH_PROVIDER=gemini` | ✅ `MATCH_PROVIDER=gemini`                   | ✅ RESOLVED — same chip-task                                 |
| **F3** | /matches M1+M3 LIVE     | ✅ `MATCHES_ENABLED=true`, /matches HTTP 200 | ✅ RESOLVED                                                  |
| **F4** | 8 γ-flags LIVE          | ✅ Все 8 флагов + NEXT_PUBLIC pairs          | ✅ RESOLVED                                                  |

#### 🟠 High — broken pages

| #      | Page                 | Symptom                                                                   | Hypothesis                                                                                                  |
| ------ | -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **F5** | `/charterers/[id]`   | `Error: Failed to load charterer` + 401 console + 20s networkidle timeout | API requires `session_id` cookie, у demo user только `demo_auth` — нет fallback на demo data; см. chip-task |
| **F6** | `/charterers` (list) | 401 console error (page рендерится, но API call fails)                    | Same root cause as F5                                                                                       |
| **F7** | `/processing`        | 403 console error                                                         | Likely same auth model gap                                                                                  |

#### 📋 Env vars status (verified 2026-05-19)

| #       | Setting                | Status                                                                         |
| ------- | ---------------------- | ------------------------------------------------------------------------------ |
| **F8**  | `RESEND_API_KEY`       | ⏸ Отсутствует на prod → ждёт регистрации resend.com user'ом                    |
| **F9**  | `SENTRY_DSN`           | ✅ **LIVE 2026-05-19** — DSN выставлен на outreach-vps, errors уже ловятся     |
| **F10** | `EXPLAIN_DEAL_ENABLED` | ✅ **LIVE 2026-05-19** — `true` + `NEXT_PUBLIC` pair, rebuild + restart pushed |

#### 🟡 Systemic — auth model surprise

**Без `session_id` cookie 18 из 24 authenticated страниц редиректят на `/`.** Только `/dashboard` (legacy alias на `/`), статичные страницы (`/login`, `/upgrade`, `/clauses`, `/onboarding`, `/admin/knowledge`), `/laytime`, `/market`, `/psc`, `/request` доступны для demo user'а с одним `demo_auth` cookie. Все остальное требует прохождения email-upload flow через `/processing` для создания `session_id`.

**Это не bug в UI** — это by-design business flow. Но Audit показал что demo user, который не сделал email upload, видит «empty app». Это может быть UX-bug: после login нужен явный CTA на `/processing` или auto-redirect.

#### Артефакты audit'а

- Spec: `docs/superpowers/specs/2026-05-19-ui-audit-design.md`
- Script: `/tmp/audit-quantika-demo.js` (24 pages × 2 viewports, parameterized via env vars)
- Screenshots: `/tmp/audit-screenshots-2026-05-19/*.png` (48 PNG)
- Report JSON: `/tmp/audit-screenshots-2026-05-19/report.json`
- Chip-tasks spawned: 3 (MATCHES_ENABLED+γ-flags activation; /charterers/[id] fix; AI_PROVIDER drift investigation)

### 1.1 Парсеры и LLM (audit-parsers.md)

**🎯 Реальный статус (2026-05-18 вечер):** Wave parser audits завершена — 11 PR за день (#197, #205, #216-218, #220-224, #226). Найден и исправлен production bug class: Gemini structured-output schema field names не совпадали с downstream contract в 2 парсерах (vessel + recap), silent-null months.

| Парсер       | Прод-провайдер | Точность                                                             | Eval                                                  | Статус                                                                                                                                   |
| ------------ | -------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| classify     | gemini-flash   | **cat 100%**, urgency 70.8%                                          | progonq R9 ✅                                         | R4 prompt active; urgency BLOCKED (GT inconsistent, см. memory)                                                                          |
| parse-cargo  | gemini-pro     | cargo **91.8%**, laycan **93.2%** (PR #197+#205 GT normalization)    | progonq R27 ✅ 3-run median                           | semantic_full 91.6%, стабилизировано                                                                                                     |
| parse-vessel | gemini-pro     | dwcc **94.9%**, open_position **92%**, open_date **91.1%** (PR #216) | progonq **R16 56/56 = 100%** ✅ (PR #326, 2026-05-22) | R8 «-13 регрессия» оказалась measurement artifact (#324). R15→R16: sc-002/003/031/034/040 закрыты. Стабильно.                            |
| parse-recap  | gemini-pro     | overall 45-58% (noisy на 3 scenarios)                                | progonq ✅ harness #218 + schema #220                 | Corpus expansion blocked — public fixture recaps конфиденциальны, ждём real recap emails в Gmail                                         |
| match        | gemini         | **progonq R7 0/25 fail** ✅ (2026-05-22)                             | progonq R0→R7, 25 scenarios                           | R0 #235 → R7 #333. idle penalty #244, Gibraltar/aliases #243, +8 Iskenderun distance pairs (#333). distance-matrix C3 audit = docs-only. |
| explain-deal | gemini-2.5-pro | **R1 11/11 PASS** ✅ (text-gen)                                      | progonq R1 (#332, 2026-05-22)                         | Eval harness #261 (R0 6/6) → R1 corpus 6→11 + Arabic prompt fix (#332). Зелёный.                                                         |
| draft-quote  | gemini-2.5-pro | **R3 6/6 PASS** ✅ (text-gen)                                        | progonq R0→R3 (#331, 2026-05-22)                      | Harness #272 (R0 6/6 fail) → R3 6/6 pass за 3 раунда prompt-правок (#331).                                                               |

**Provider routing (текущий, на проде):** **7/7 scopes default через Gemini** (AI_PROVIDER=gemini + MATCH_PROVIDER=gemini). ClipProxy/OpenAI + claude-cli больше не активны по умолчанию (только если env override вернуть). claude-cli остаётся для eval judge (через --print, не runtime).

**Текущая работа:** bake-off конкретных Gemini моделей (Flash vs Pro vs 2.5 Pro vs новые) per parser идёт в отдельной user-сессии. Цель — выбрать оптимальную модель по cost/accuracy.

**Bake-off вердикты:** разблокированы (judge через claude-cli работает).

### 1.2 Data Layer (verified 2026-05-19 reality audit)

**31+ миграция применена.** **Большинство таблиц заполнены**, **но 2 пустые при включённых флагах** (P0 в §2):

| Статус                   | Таблицы                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Свежие, заполненные   | ofac_entities (18,959), schema_migrations, knowledge_sources, market_indices (92), charterers (20), port_da_estimates (94), psc_detention_history (16), port_distances (18,648) + **searoute JSON 105,011 пар (tier 2) + live tier 3** ✅ 2026-05-20, **eu_sanctions_entities (5,996)**, **port_master (11,767)**, **roi_metrics (18)** ✅ seed 2026-05-22, **fx_rates (212)** ✅ daily timer 03:00 UTC (PR #323/#327), **eca_zones (4)** ✅ parser fix + seed 2026-05-22 (PR #338) |
| ✅ RAG embedded          | imsbc_fts (116), igc_fts (119), jwc_fts (7), bimco_fts (14) — counts выше чем заявлялось в audit 2026-05-17                                                                                                                                                                                                                                                                                                                                                                         |
| ⚠️ Частичные             | baltic/bunker/eua (устарели, manual CSV upload), war_risk_zones (4)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ✅ Исправлено 2026-05-22 | eca_zones (0→4) — parser fix polygon_geojson + seed (PR #338)                                                                                                                                                                                                                                                                                                                                                                                                                       |

**RAG-архитектура:** гибрид FTS5+vec0 (sqlite). Vertex Search disabled (extractiveContentSpec Enterprise-only, наши engines Standard) — rollback на SQLite богаче.

**Bug FIXED:** `bimco_vec` теперь в allowlist `retriever-sqlite.ts` (PR #186).

### 1.3 API Surface (audit-api.md)

**50 routes всего.** Coverage:

| Auth tier                  | Routes                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| public                     | health, knowledge clauses (флаг), market indices (флаг), TCE, vessel, canal, etc.                                                           |
| session (DEMO_AUTH cookie) | dashboard, match, /ai/_, audit, charterers, **/api/analytics/roi (γ-18)**, \*\*/api/laytime/_ (γ-05)**, **/api/knowledge/clauses (γ-09)\*\* |
| admin (X-Admin-Token)      | knowledge refresh, market upload-csv, knowledge-status                                                                                      |
| cron (X-Cron-Secret)       | cron-heartbeat                                                                                                                              |
| HMAC                       | whatsapp webhook, pipedrive webhook                                                                                                         |
| internal token             | whatsapp ingest                                                                                                                             |

**✅ AUTH_BYPASS_PATHS gap CLOSED (verified 2026-05-19):** все 5 webhook путей присутствуют в `middleware.ts` (lines 19-27) + покрыты тестами в `middleware-auth.test.ts` (bypassPaths lines 60-64):

- `/api/whatsapp/webhook` ✅
- `/api/whatsapp/ingest` ✅
- `/api/integrations/pipedrive/webhook` ✅
- `/api/admin/knowledge/refresh` + `/api/admin/knowledge-status` ✅

**Cron heartbeat coverage:** 5/5 скриптов теперь шлют (после PR #182 — localhost route bypasses CF header stripping).

**Тесты:** 17 routes без функциональных тестов (auth/logout, agent/\*, /economics, /vessel/[imo], etc.) — остаётся в backlog.

**13 feature flags** в коде. **8 default ON** (γ-флаги активированы 2026-05-17). 5 остаются OFF.

### 1.4 UI/UX (audit-ui.md)

**23 страницы:** 14 production-ready, 7 feature-gated **(теперь все 7 unlocked через γ-флаги)**, 2 заглушки (`/upgrade`, `/matches`).

**70+ компонентов.** Покрытие тестами:

- Хорошо: match/, vessel/, dashboard/, mobile/, economics/, **market/ (PR #192)**
- ❌ Нет: charterers/, psc/, recap/, request/, ui/ (shadcn)

**Mobile scorecard:**

- ✅ BottomSheet + SwipeCard + FabVoice (haptics, focus trap, gestures)
- ⚠️ Feature-страницы (laytime, market, PSC) — desktop-first, нет `sm:` fallback
- ❌ Bottom navigation
- ❌ Touch target min-h-44px enforcement

**RTL:** только контент email (ExplainDealModal AR mode). Full UI RTL — нет (no i18n, no logical CSS properties).

**PWA: 0** — нет `public/manifest.json`, нет service worker, нет install prompt, нет theme-color.

**Баги (актуально):**

- ✅ `EXPLAIN_DEAL_ENABLED` — выставлен на проде 2026-05-19 с `NEXT_PUBLIC_` парой, rebuild + restart, smoke 200
- ✅ `SubsCountdownWidget` — live `setInterval(... 60_000)` стоит в `components/deals/SubsCountdownWidget.tsx:37`; `components/deadlines/SubsCountdown.tsx` тикает каждую секунду. Тесты `.tick.test.tsx` зелёные. ROADMAP заявление было stale (PR #204 + #208 уже закрыли)

### 1.5 История волн (audit-waves.md)

| Волна                                                                                              | Статус                                                                                                                    | Поставлено                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Pre-MVP** (Audit Foundation, Wave 2, Architecture)                                               | ✅                                                                                                                        | PR #1-#4, +268 тестов                                      |
| **MVP Wave 1-4** (Hard filters → ports 431)                                                        | ✅                                                                                                                        | v0.2 → v1.1 теги, 376 тестов                               |
| **Wave α** (15 спек Web/WhatsApp/Gmail)                                                            | ✅                                                                                                                        | PR #8, +301 тест, 700+ всего                               |
| **Wave β + βf×3** (depth + fixes, adversarial QA)                                                  | ✅                                                                                                                        | PR #46-#53, 1840 тестов, v1.4-eval-qa                      |
| **Wave γ — Vertex migration** (13 спек OpenAI→Gemini/Bedrock)                                      | ✅                                                                                                                        | PR #85 + #98                                               |
| **Wave γ — Knowledge L1+L2** (RAG hybrid + IMSBC/IGC/JWC/BIMCO + sanctions)                        | ✅                                                                                                                        | PR #92, #99, #102, #103                                    |
| **Wave γ — Scale** (11 спек: γ-01..18)                                                             | ✅                                                                                                                        | PR #127                                                    |
| **Wave γ — flag activation** (все 8 γ-флагов LIVE)                                                 | ✅                                                                                                                        | env edits 2026-05-17                                       |
| **Day batch 2026-05-17 morning** (incident restore + data + Bedrock→cli)                           | ✅                                                                                                                        | PR #172-#186 (12 PR)                                       |
| **Day batch 2026-05-17 evening (Plan A)** (tracking issues + parser baseline + flaky test + seeds) | ✅                                                                                                                        | PR #187-#194 (8 PR, из них 3 fix)                          |
| **Parse-cargo track** (R14 → R4 normalizer)                                                        | 🟡                                                                                                                        | R5 в работе (path exhausted — нужна GT нормализация ~4-6h) |
| **Wave γ original 13 спек**                                                                        | 1✅/0🟡/**8❌** (8 архивированы решением: ice-class, tone, counterparty-int, SignWell, Wise+Xero, audit PDF, Apple Watch) |
| **Wave δ** (Native iOS, SSO, white-label, APIs, team)                                              | 0/0/5 — **не начато** (правильно: post-PMF)                                                                               |

**ROADMAP vs delivered — Wave α delta:** 12✅ / 5🟡 / 0❌. 🟡 items: market live feed (manual CSV), digest content, 14-day billing backend, quote PDF pipeline, etc.

---

## 2. Критические проблемы (cross-domain, требующие срочности)

### 🚨 P0 — Активные

_(пусто — C4/C5 закрыты 2026-05-22)_

### ✅ P0 — Закрытые

| #      | Issue                                                                                  | Closed by                                                                                    |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **C1** | Bedrock Opus 4.7 → claude-cli replacement                                              | PR #186                                                                                      |
| **C2** | 5 webhooks AUTH_BYPASS_PATHS                                                           | ✅ Все 5 в middleware.ts:19-27 (verified 2026-05-19) — PR #221 + позже                       |
| **C3** | EU_SANCTIONS_TOKEN                                                                     | ✅ Token `n00mo9i3` валиден (HTTP 200, 24.7MB), `knowledge_sources.eu-sanctions=fresh`       |
| **C4** | `roi_metrics=0` при `ROI_GUARANTEE_ENABLED=true` — tile рендерил "No voyages" заглушку | ✅ seed 18 строк (scripts/seed-roi-metrics.ts) — 2026-05-22                                  |
| **C5** | `fx_rates=0` при `MULTI_CURRENCY_V2_ENABLED=true` — конверсия через hardcoded fallback | ✅ daily timer 03:00 UTC LIVE, 212 rows — PR #323 (cron) + #327 (User=root fix) — 2026-05-22 |

### 🟠 P1 — Активация data layer

**Полностью выполнено 2026-05-17.** Все таблицы заполнены (см. §1.2).

| #      | Task                                                | Статус                                                |
| ------ | --------------------------------------------------- | ----------------------------------------------------- |
| **D1** | port_distances seed (17,985 = real complete target) | ✅ DONE                                               |
| **D2** | market_indices (90 rows: BHSI/TMI/Drewry × 30d)     | ✅ DONE                                               |
| **D3** | charterers (20 blue-chip names)                     | ✅ DONE                                               |
| **D4** | port_master seed                                    | ✅ DONE — 11,767 строк на проде (verified 2026-05-19) |
| **D5** | port_da_estimates (94 rows)                         | ✅ DONE                                               |
| **D6** | psc_detention_history (16 rows)                     | ✅ DONE                                               |
| **D7** | RAG embeddings imsbc/igc/jwc/bimco (141 chunks)     | ✅ DONE                                               |
| **D8** | bimco_vec allowlist fix                             | ✅ DONE (PR #186)                                     |

### 🟡 P2 — Активация γ флагов

**Полностью выполнено 2026-05-17.** Все 8 γ-флагов LIVE на проде.

| Флаг                       | Статус                                                                 | PR/commit              |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `SUBS_TIMER_V2` (γ-08)     | ✅ LIVE                                                                | batch-1                |
| `LAYTIME_ENGINE` (γ-05)    | ✅ LIVE                                                                | batch-1                |
| `BIMCO_RAG` (γ-09)         | ✅ LIVE                                                                | batch-1                |
| `CHARTERER_CREDIT` (γ-02)  | ✅ LIVE                                                                | batch-2                |
| `PSC_DETENTION` (γ-03)     | ✅ LIVE                                                                | batch-2                |
| `FUELEU` (γ-11)            | ✅ **LIVE** — re-activated 2026-05-19 (was DRIFT; env fixed + rebuild) |
| `ROI_GUARANTEE` (γ-18)     | ✅ LIVE                                                                | batch-3 (PR #187 seed) |
| `MULTI_CURRENCY_V2` (γ-01) | ✅ **LIVE** — re-activated 2026-05-19 (was DRIFT; env fixed + rebuild) |
| `SUBS_TIMER_V2` (γ-08)     | ✅ **LIVE** — re-activated 2026-05-19 (was DRIFT; env fixed + rebuild) |
| `MATCHES_ENABLED` (M1+M3)  | ✅ **LIVE** — activated 2026-05-19 (was NOT SET; env fixed + rebuild)  |

---

## 3. Приоритизированная Roadmap

### Следующие 7 дней (refreshed 2026-05-19 post-reality-audit)

**Тема:** «Закрыть остаточные data layer gaps + parser quality + UX polish»

Большая часть старого 7-day списка закрыта (см. ✅ P0 в §2). Остаток:

1. ✓ **AUTO-DEPLOY LIVE 2026-05-19** — `.github/workflows/deploy.yml` LIVE QD (#259) + AL (#200). hands-off: PR `[code-only]` → CI → auto-merge → deploy.yml → SSH → health check + auto-rollback. Manual ssh+pull obsolete.
2. ✓ **CI auto-rebase #265** — solves BEHIND mergeStateStatus для solo-developer auto-merge. После merge — petля размыкается автоматически.
3. ✓ **F1/F2/F3/F4/F9/F10 закрыты** (см. §1.0). C2/C3 закрыты (§2 ✅ table).
4. ✓ **C4 закрыт 2026-05-22** — seed `roi_metrics` на проде (18 строк).
5. ✓ **C5 закрыт 2026-05-22** — `fx_rates` daily timer 03:00 UTC LIVE (PR #323/#327).
6. **F5+F6+F7 закрыты** — auth model gap. F5+F6 via PR #254, **F7 (/processing 403 CSRF) via PR #322 (2026-05-22)**.
7. ✓ **Parser quality (agent-side) закрыто 2026-05-22** — match R7 0/25, explain-deal R1 11/11, draft-quote R3 6/6, parse-vessel R16 56/56 (#331-334). **Остаток только на данных партнёра:** classify urgency (70.8%) + parse-recap (45-58%) — опросник `~/quantika-partner-questionnaire.md` готов, ждём ~10 recap + 15-20 размеченных писем → калибровка до 95%+.

ETA: ~2-3 дня wall-clock. Большинство agent-only. **Bottleneck теперь — данные партнёра, не разработка.**

### Следующие 30 дней (остаток мая - середина июня)

**Тема:** «Parser quality + UX polish + monitoring»

1. **Parse-cargo R5** — финализация (path exhausted, нужна нормализация GT ~4-6h)
2. **parse-vessel dwcc fix** — единицы измерения bug (51.9% → ?)
3. **match progonq baseline** — давно пора
4. **parse-recap fix-loop** — улучшить с 70% baseline (PR #193 идентифицировал weakest fields)
5. **MEDIUM/LOW backlog** из QA reports (continuous)
6. **Mobile bottom nav + touch targets enforcement**
7. **Test coverage для 17 untested routes + missing component tests**
8. **/upgrade** — заменить заглушку на реальный контент (✅ /matches уже live с M1+M3, session fix #296)
9. **Sentry + UptimeRobot** интеграция (когда аккаунты готовы)
10. **port_master seed** (D4 — отложен, может понадобиться для расширенных features)

### Следующие 90 дней (середина июня - середина августа)

**Тема:** «PWA + RTL полный + WhatsApp polish + первые платящие клиенты»

1. **PWA setup** — manifest.json, service worker, install prompt
2. **Arabic RTL** — full UI, не только контент email (logical CSS properties, i18n framework)
3. **Mobile-first overhaul** для feature pages (laytime, market, PSC)
4. **WhatsApp digest content** финализация
5. **Quote PDF pipeline** для activation metric
6. **Billing backend** — Stripe интеграция (когда сигналы первого платящего клиента)
7. **Counterparty Intelligence** lite (Brave News free, архивирована из γ но переоценить если клиенты просят)

### Post-PMF (Wave δ)

Не начинаем до того как:

- 10+ paying customers signed
- Activation metric (1 real deal in 7 days) consistently met
- Quote PDF + billing live

Затем:

- Native iOS wrapper
- SSO (Okta/Azure)
- White-label
- Public API (Veson/Kpler/MarineTraffic)
- Team collaboration

### Deferred — user-blocked (не приоритет, разблокируется решением Виталия)

- ⏸ **F8 RESEND_API_KEY** — транзакционная почта (alerts/digest). Ждёт регистрации на resend.com и получения API-ключа (user-only). После выдачи ключа — выставить на prod + smoke. Понижено в приоритет 2026-05-22 (не блокирует core flow, есть fallback). Не входит в 7/30/90-day планы до получения ключа.

---

## 4. Принципы работы с документом

1. **Living document.** Каждое решение «делать X» сверяем с этим файлом. Если X = ✅ done — не предлагаем.
2. **Update cadence:** после каждого merged PR — обновляем relevant section (✅/🟡/❌, ETA, owner).
3. **Audit refresh:** раз в 30 дней — повтор 5-stream audit, regenerate sections 1.\*.
4. **Старый ROADMAP-SESSION-PROMPT.md** = deprecated (был prompt для генерации wave_plan, не state). Не удалён для истории, но не используется.
5. **Источники отчётов:** `/root/orchestrator-state/audit-2026-05-17/*.md` на VPS — детали по каждому домену.

---

## 5. Quick Reference

**Prod URL:** https://demo.quantika.org (auth: DEMO_AUTH cookie)
**VPS:** dev-VPS root@157.173.124.116
**Path:** `/root/work/quantika-demo`
**PM2:** `quantika-demo` cluster
**DB:** `data/sessions.db` (legacy filename, содержит и sessions и knowledge tables)
**Backup:** ежедневно 00:00 UTC → `/var/backups/quantika/`
**Inotify:** `env-local-watcher.service` + auditd
**Cron heartbeat:** http://localhost:3000/api/admin/cron-heartbeat (CF strips X-Cron-Secret on external)
**Provider routing source:** `lib/ai-provider.ts` (claude-cli + openai + gemini + bedrock)
**Feature flags source:** `lib/knowledge/flags.ts` + grep `process.env.*_ENABLED`
**Wave plans:** `~/.claude/plans/idempotent-seeking-quokka.md` (breakbulk pivot), `.wave/wave_plan-beta-fixes.yaml`
**Runbooks:** `docs/runbooks/wave-gamma-flag-activation.md`
**Env backups:** `.env.local.before-*-YYYYMMDD-HHMM` (incident recovery)

## Full Redesign R1-R6 — COMPLETED 2026-05-25

Полный редизайн UI/UX завершён. Все 22 страницы мигрированы на Maritime Deep design-system.

| Wave | Что сделано |
|------|-------------|
| R1 | Design-system foundation — Maritime Deep tokens, 15 primitives, `/design` preview page |
| R2 | AppShell + ModeSwitcher (charterer/owner mode), persistent navigation |
| R3 | AIBar + ⌘K command palette + HelpFAB |
| R4 | LiveStrip + SSE jobs + match toasts |
| R5 | 22 страницы мигрированы (Dashboard, Matches, Match/[id], Cargo, Vessels, Charterers, Market, Recap, Email, Onboarding, Upgrade, Settings, Laytime, PSC, Commission, Clauses, Request, Processing, Summary, More, Vessel/[id], Fixture) |
| R6 | A11y baseline — Playwright+axe specs для всех 23 страниц (WCAG 2.1 AA); Lighthouse CI gate (perf ≥0.85, a11y ≥0.95); living docs |

**Specs:** `docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md`
**Plans:** `docs/superpowers/plans/2026-05-24-r6-a11y-perf-plan.md`
**Design overview:** `docs/design-system.md`

**Open follow-ups (R6.5):**
- Migrate remaining `components/ui/` usages (40 imports, 22 files) → delete legacy dir (Q002)
- Activate dark mode toggle (tokens drafted)
- Lighthouse CI в GitHub Actions workflow (нужен `@lhci/cli` install)

---

## Archived / Consolidated (2026-05-22)

Этот файл — единственный актуальный роадмап. Старые wave-планы 2026-04 сведены в архив (без потери данных):

- [\_archive/2026-05-22/ROADMAP_WAVE2.md](_archive/2026-05-22/ROADMAP_WAVE2.md), [ROADMAP-features.md](_archive/2026-05-22/ROADMAP-features.md), [ROADMAP-infra.md](_archive/2026-05-22/ROADMAP-infra.md) — без внешних ссылок.

Оставлены в корне (на них есть ссылки, трогать нельзя без правок кода/промптов): `ROADMAP_MVP.md` (ссылка из кода `lib/parsing/parse-cargo-ai.ts`) и `ROADMAP.md` (ссылки из session-промптов).

---

🤖 Сгенерировано 5-stream system audit (parsers/data/api/ui/waves) + synthesis оркестратором. Последнее обновление: 2026-05-22 вечер (#341 manual deploy, 11 PR merged, worktree cleanup, auto-deploy trigger debt open).
