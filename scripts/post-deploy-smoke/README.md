# Post-Deploy Smoke

Headless playwright check на prod (`https://demo.quantika.org`) после успешного `deploy.yml`. Гоняется на **dev-vps** (`157.173.124.116`) через GitHub Action `.github/workflows/post-deploy-smoke.yml`.

## Что делает

Открывает 5 ключевых routes (`/`, `/cargo`, `/vessel`, `/match`, `/login`) в headless Chromium на dev-vps, проверяет:

- HTTP status 2xx/3xx (4xx/5xx → FAIL)
- DOM не содержит error-markers (`application error`, `internal server error`, `unhandled`, `stack trace`, `next.js error`)
- Нет console errors (после фильтрации favicon/sentry/chunk/4xx-resource-probe noise)
- Полный screenshot каждого route (1280×800 viewport)

Outputs:

- `~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/summary.json`
- `~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/<route>.png` (5 файлов)

Exit 0 = все 5 routes PASS · exit 1 = хоть один FAIL.

## Resilience (anti-false-negative)

Прод рестартует через `pm2 restart` (hard, brief downtime), а `Caddyfile.demo` — bare
`reverse_proxy` без `health_uri`, поэтому в окне рестарта Caddy отдаёт 5xx. Чтобы smoke
не падал на этом окне (а только на настоящих регрессиях):

- **(a) health-gate** — перед проверкой routes поллит `/api/health` до 200 (до 90s,
  интервал 3s). `overall=PASS` только если health поднялся **и** все routes отрендерились.
- **(b) route retry** — каждый route ретраит до 3× с линейным backoff, но **только на
  транзиентных** сбоях (network error / status 0 / 5xx). Реальный 4xx или error-marker
  падает сразу (`attempts=1`) — настоящие регрессии не маскируются.

`summary.json` содержит блок `health: { healthy, attempts, waited_ms, last_error }`.

## Manual run (на dev-vps)

```bash
ssh root@dev-vps
bash /root/post-deploy-smoke/run-quantika.sh <pr#>
# или с custom URL:
bash /root/post-deploy-smoke/run-quantika.sh manual https://staging.example.com
```

## CI flow

```
auto-merge.yml → repository_dispatch (prod-deploy)
                     ↓
              deploy.yml → SSH outreach-vps → /root/deploy-quantika-demo.sh
                     ↓ (success)
              workflow_run trigger
                     ↓
        post-deploy-smoke.yml → SSH dev-vps → run-quantika.sh <pr#>
                     ↓
              gh pr comment <pr#> --body "✅/❌ smoke ..."
```

## Required GH Secrets

| Secret            | Что                                                   | Где использован         |
| ----------------- | ----------------------------------------------------- | ----------------------- |
| `DEV_VPS_SSH_KEY` | ed25519 private key (открытый SSH, не forced-command) | `post-deploy-smoke.yml` |

`PROD_SSH_KEY` НЕ переиспользуется — он locked-down (forced-command `/root/deploy.sh`), не может запускать произвольный bash.

## Tuning

- Добавить route: edit `ROUTES_DEFAULT` в `smoke.mjs` или передать `SMOKE_ROUTES="/foo,/bar"` env var.
- Изменить timeout: `SMOKE_TIMEOUT=20000` (ms).
- Custom base URL: `SMOKE_BASE_URL=https://staging...`.
- Health-gate: `SMOKE_HEALTH_PATH=/api/health`, `SMOKE_HEALTH_TIMEOUT_MS=90000`, `SMOKE_HEALTH_INTERVAL_MS=3000`, `SMOKE_HEALTH_PROBE_TIMEOUT_MS=5000`.
- Route retry: `SMOKE_ROUTE_ATTEMPTS=3`, `SMOKE_ROUTE_BACKOFF_MS=3000` (линейный backoff).
- Console-error фильтр в `smoke.mjs` — расширь regex для новых noise patterns.

## t60 bake window

После **PASS** immediate smoke, `post-deploy-smoke.yml` по SSH запускает на dev-vps
`schedule-t60.sh <pr#> <sha>`, который:

1. пишет `<sha>` в глобальный маркер `~/orchestrator-state/quantika-demo/post-deploy-checks/.deployed-sha`
   (источник правды «какой SHA задеплоен последним») и в per-PR копию `t60-scheduled-sha`;
2. останавливает предыдущий таймер (если есть) и планирует новый транзиентный systemd-таймер
   с фиксированным именем `quantika-t60-smoke` на `--on-active=60min`.

Ожидание идёт **на dev-vps**, не в GH runner'е — раннер завершается сразу, Actions-минуты
на час простоя не тратятся. Новый деплой заменяет ещё не сработавший таймер (тот же unit name).

Через 60 минут таймер запускает `run-t60.sh <pr#> <sha>`:

- если текущий `.deployed-sha` **не совпадает** с `<sha>` (пришёл более новый деплой) →
  `overall:"superseded"` — нейтральный вердикт, не FAIL;
- иначе — переиспользует `smoke.mjs` **без изменений** (тот же прогон 5 routes + health-gate),
  дополняет результат полями `bake_window`/`scheduled_sha`/`superseded` и пишет в
  `~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/summary-t60.json`
  (рядом с immediate `summary.json`, не затирая его).

Сравнение `summary-t60.json` с `summary.json` / prod-логами — вне этого репо, делает
orchestrator.

## Phase 3 (orchestrator-day integration)

Orchestrator-day skill v3.15.0+ читает `~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/summary.json` на wake и выдаёт первой строкой:

- PASS → «PR #N prod-check ✅ — открой screenshot тут … далее USER_CHECKLIST (Gate 5)»
- FAIL → «PR #N prod-check ❌ — упало <routes>, см. screenshot, нужен фикс»
