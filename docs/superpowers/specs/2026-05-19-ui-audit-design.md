# Quantika Demo — Full UI Audit (2026-05-19)

**Тип:** orchestrator session plan (not feature spec)
**Сессия:** main MacBook + dispatch на /vpsQ (root@157.173.124.116)
**Параллельный track (не часть этой работы):** parser/match upgrades в отдельной user-сессии
**Создан:** 2026-05-19 после `/brainstorming` (4 вопроса)

## Цель

Провести полный feature-by-feature audit живого приложения `https://demo.quantika.org` через UI (browser), задокументировать реальный пользовательский опыт, и обновить `docs/ROADMAP-CURRENT-STATE.md`. Существующий 5-stream audit от 2026-05-17 покрывает код/тесты/git, но НЕ браузерный UX — это его дополнение.

## Контекст: что уже сделано

Существующие артефакты (НЕ дублировать):

- `docs/ROADMAP-CURRENT-STATE.md` (295 строк, последнее обновление 2026-05-17 вечер; на 2026-05-19 утром stale — 7-day list ~90% closed)
- `/root/orchestrator-state/audit-2026-05-17/{parsers,data,api,ui,waves}.md` на VPS (5-stream system audit)
- Memory: `reference_quantika_demo_living_roadmap`

Stale items в текущем ROADMAP (закрыты PR'ами #194 — #233 за 18-19 мая):

- C2 webhooks AUTH_BYPASS (PR #206 + #221)
- EXPLAIN_DEAL_ENABLED NEXT_PUBLIC fix (PR #204)
- SubsCountdown live interval (PR #204 + #208)
- npm audit CRITICAL+3 HIGH (PR #203)
- Sentry wiring (PR #209 + #219)
- Email alerts через Resend (PR #194, нужен только API key)

## Out of scope

- Парсеры (classify/parse-cargo/parse-vessel/parse-recap/match) — параллельная user-сессия
- `match` baseline / corpus expansion — Phase D3 (PR #250 OPEN) под parser session
- Backend code changes — этот audit только observes, не fixes. Findings выходят как chip-tasks для отдельных sessions.
- Полное Playwright test suite (CI integration) — это будущий проект, не сегодня
- Mobile bottom navigation component — design input должен прийти ИЗ этого audit'а, не до него

## Архитектура — hybrid VPS+local

| Phase                  | Где исполняется      | Инструмент                   | Output                                  |
| ---------------------- | -------------------- | ---------------------------- | --------------------------------------- |
| **1. Systematic pass** | /vpsQ (root@VPS)     | playwright-skill (headless)  | 46 screenshots + JSON state per page    |
| **2. Deep-dive**       | MacBook              | Chrome MCP (visible browser) | Narrative findings, chip-tasks per bug  |
| **3. API smoke**       | /vpsQ                | bash curl                    | HTTP status + body sniff per route      |
| **4. ROADMAP refresh** | MacBook (этa сессия) | Edit tool                    | Updated `docs/ROADMAP-CURRENT-STATE.md` |
| **bg-parallel**        | /vpsQ (worktree)     | dev-pipeline-deep            | PR: test coverage backfill 7 routes     |

### Зачем hybrid (не чистый VPS, не чистый local)

- VPS для систематики: thin-client pattern (memory: dev-vps); MacBook не греется; артефакт остаётся для rerun
- MacBook для deep-dive: Chrome MCP требует locally connected browser extension, нет equivalent на VPS
- API curl на VPS = тот же CF-путь до prod, что и Playwright Phase 1 → consistent network conditions

## Phase 1 — Playwright systematic pass

### Script structure

Файл: `/tmp/audit-quantika-demo.js` на dev-VPS. Запуск:

```bash
ssh root@157.173.124.116 'cd /root/.claude/skills/playwright-skill && node run.js /tmp/audit-quantika-demo.js'
```

Шаблон (key elements):

```javascript
const { chromium } = require("playwright");

const TARGET_URL = "https://demo.quantika.org";
const PAGES = [
  { path: "/login", name: "login", auth: false },
  { path: "/dashboard", name: "dashboard", auth: true },
  { path: "/matches", name: "matches", auth: true },
  // ... всего 23 page descriptors
];
const VIEWPORTS = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "mobile", width: 375, height: 667 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // 1. Login once, persist DEMO_AUTH cookie via context
  const loginPage = await context.newPage();
  await loginPage.goto(`${TARGET_URL}/login`);
  await loginPage.fill('input[name="email"]', process.env.DEMO_EMAIL);
  await loginPage.fill('input[name="password"]', process.env.DEMO_PASSWORD);
  await loginPage.click('button[type="submit"]');
  await loginPage.waitForURL("**/dashboard");
  await loginPage.close();

  const report = [];

  // 2. For each page × viewport: screenshot + state
  for (const pageDescriptor of PAGES) {
    for (const viewport of VIEWPORTS) {
      const page = await context.newPage();
      const errors = [];
      page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
      page.on("pageerror", (err) => errors.push(err.message));

      await page.setViewportSize(viewport);
      const startMs = Date.now();
      const response = await page.goto(`${TARGET_URL}${pageDescriptor.path}`, {
        waitUntil: "networkidle",
        timeout: 15000,
      });
      const loadMs = Date.now() - startMs;

      const screenshotPath = `/tmp/audit-screenshots/${pageDescriptor.name}-${viewport.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });

      report.push({
        page: pageDescriptor.name,
        path: pageDescriptor.path,
        viewport: viewport.name,
        httpStatus: response?.status() || null,
        loadMs,
        title: await page.title(),
        screenshot: screenshotPath,
        consoleErrors: errors,
        url: page.url(), // catches redirects
      });
      await page.close();
    }
  }

  await browser.close();
  require("fs").writeFileSync("/tmp/audit-report.json", JSON.stringify(report, null, 2));
  console.log(
    `OK: ${report.length} entries (${PAGES.length} pages × ${VIEWPORTS.length} viewports)`
  );
})();
```

### Pages inventory (23 страницы по audit-ui.md)

User-facing (21):

```
/login, /dashboard, /matches, /upgrade, /charterers, /psc, /economics,
/laytime, /market, /vessel/[imo example], /request, /agent/*, /knowledge,
/auth/logout, /processing, /digest, ...
```

Admin (2):

```
/admin/knowledge-status, /admin/market-csv-upload
```

Точный список генерируется из `app/**/page.tsx` через скрипт ДО Phase 1.

### Auth handling

`DEMO_EMAIL` + `DEMO_PASSWORD` — env vars (НЕ хардкодить в скрипте). Получены из VPS `.env.local`.

Если login fails → script aborts с понятной ошибкой. НЕ skip pages requiring auth — это hides половину audit'а.

### Failure modes

| Симптом             | Что делать                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| CF challenge / 403  | Retry with longer wait; если хроническое — fallback на curl + headers `User-Agent: Mozilla...` |
| Rate limit (429)    | Wait 60s + resume                                                                              |
| Page timeout >15s   | Записать в report (это уже finding) и continue к следующей                                     |
| Login redirect loop | Abort, escalate — что-то сломано в auth и audit бесполезен                                     |

## Phase 2 — Deep-dive (Chrome MCP local)

Triggered когда screenshot или JSON report показывает аномалию:

- HTTP status != 200 (но redirect к /login — это норма для protected)
- consoleErrors > 0 (особенно React hydration warnings)
- loadMs > 5000
- Title equals "404" / "Application error"
- Visual bug в screenshot (empty page, broken layout, missing data)

Для каждой аномалии:

1. Открыть страницу через `mcp__Claude_in_Chrome__navigate` (visible browser у меня)
2. Inspect DOM / console / network panel
3. Если bug подтверждён — `mcp__ccd_session__spawn_task` с self-contained брифом:
   - Title: `Fix: <page> <symptom>` (60 chars)
   - Prompt: воспроизведение шагов + ожидаемое поведение + relevant files
   - TLDR: 1-2 предложения для chip UI

### Chip-task severity criteria

- **CRITICAL** (immediate spawn): login fails, prod-blocking 500, data loss, security leak
- **HIGH** (spawn after audit): page broken / unusable, visible XSS, auth bypass
- **MEDIUM** (chip-task, batch): UX glitch, missing mobile responsive, console errors
- **LOW** (note in ROADMAP, no chip): typo, minor visual issue

## Phase 3 — API smoke (50 routes)

Скрипт `/tmp/api-smoke.sh` на VPS:

```bash
#!/usr/bin/env bash
# Iterates /api/* routes from app/api/**/route.ts grep
# curl с DEMO_AUTH cookie из login flow
# Output: route, status, time_ms, content-type, body_sniff(first 200 chars)
```

Public routes — без cookie. Session routes — с cookie. Admin — пропускаем (нужен X-Admin-Token; не часть user-facing audit).

Routes inventory из `find app/api -name route.ts | xargs grep -l 'export'`.

Output: `/tmp/api-smoke-report.tsv`.

## Phase 4 — ROADMAP refresh + chip-tasks summary

### Updates в `docs/ROADMAP-CURRENT-STATE.md`

1. Header: дата `Последнее обновление: 2026-05-19` + версия
2. Краткая сводка: что изменилось за 18-19 мая (16 QD PR + 9 AL PR)
3. Section 1.\* (домены): inline status updates по domain (parsers/data/api/ui/waves)
4. Section 2 (Critical problems): ✅ DONE отметка для C2, C3, EXPLAIN_DEAL, SubsCountdown, npm audit, Sentry, Resend (where merged)
5. Section 3 (Priority roadmap): пересоставить «следующие 7 дней» (старый список почти весь закрыт)
6. **Новый раздел: «UI Audit Findings (2026-05-19)»** — список chip-tasks (если есть spawn'ed task) + LOW notes (без chip)

### Chip-tasks summary (financial visibility)

В конце сессии — single message: список всех `spawn_task` invocations c title + severity. User видит chip'ы в UI, может dismiss или launch.

## Bg-parallel: test coverage backfill (опционально)

**Trigger:** dispatch ДО Phase 1 starts (5 мин setup).

**Goal:** Backfill jest tests для 7 untested API routes (audit-api.md):

```
auth/logout, agent/[id], agent/list, /economics, /vessel/[imo], request/[id], processing
```

Mechanical work — следовать pattern существующих `*.test.ts`. Не блокирует Phase 1-3.

**Mechanism:** `Skill("dev-pipeline-deep")` с self-contained prompt (Tier M, includes file list, acceptance criteria, Out-of-scope).

**Heartbeat:** 10-мин wake-ups через `ScheduleWakeup` (per Hard Rule 8) пока bg-stream active.

**Если bg-stream завершится BLOCK** → не fix-loop в этой сессии; chip-task для следующей. Audit важнее.

## Risks + mitigations

| Risk                                      | Mitigation                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Cloudflare блок Playwright на VPS         | Fallback на curl headers; если хроническое — Phase 1 запустить локально        |
| DEMO_AUTH credentials не работают         | Сначала проверить login flow вручную через curl; abort если broken             |
| Screenshots слишком много для review (46) | Использовать JSON report как фильтр: review только аномалии                    |
| Phase 2 раздувается (вижу bug → хочу fix) | Hard rule: this session НЕ пишет fixes, только chip-tasks                      |
| Bg-stream Q1-chain (>3 rounds)            | Per Hard Rule 11: STOP + escalate; не блокирует audit                          |
| Cost overrun                              | Phase 1 = ~$1 (Playwright local); bg-stream ~$5-10; deep-dive ~$5 → total ≤$20 |

## Estimated timing

- Phase 0 (setup): 10 мин (pages inventory + script skeleton)
- Phase 1 (Playwright pass): 25 мин wall-clock (5-10 min script run + my review of JSON)
- Phase 2 (deep-dives): 60-90 мин (depends on # anomalies)
- Phase 3 (API smoke): 30 мин (script + review)
- Phase 4 (ROADMAP refresh): 30 мин

Total: ~2.5-3 ч моего активного wall-clock. Bg-stream кипит параллельно ~60-90 мин.

## Success criteria

1. `docs/ROADMAP-CURRENT-STATE.md` обновлён со свежим status'ом (header дата 2026-05-19)
2. 46 screenshots + JSON report на VPS архивированы для будущих rerun'ов
3. Для каждого confirmed bug в UI — spawn_task chip с self-contained брифом
4. Final chip-list visible в чате (user видит и может одобрить/dismiss)
5. Bg-stream вернул либо merged PR (test coverage backfill), либо BLOCK с понятной причиной

---

🤖 Сгенерировано через `superpowers:brainstorming` (4 clarifying questions: UI test mode → tweaks scope → deliverable → walkthrough scope).
