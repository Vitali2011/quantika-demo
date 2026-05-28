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

| Secret | Что | Где использован |
|---|---|---|
| `DEV_VPS_SSH_KEY` | ed25519 private key (открытый SSH, не forced-command) | `post-deploy-smoke.yml` |

`PROD_SSH_KEY` НЕ переиспользуется — он locked-down (forced-command `/root/deploy.sh`), не может запускать произвольный bash.

## Tuning

- Добавить route: edit `ROUTES_DEFAULT` в `smoke.mjs` или передать `SMOKE_ROUTES="/foo,/bar"` env var.
- Изменить timeout: `SMOKE_TIMEOUT=20000` (ms).
- Custom base URL: `SMOKE_BASE_URL=https://staging...`.
- Console-error фильтр в `smoke.mjs` line ~57 — расширь regex для новых noise patterns.

## Phase 3 (orchestrator-day integration)

Orchestrator-day skill v3.15.0+ читает `~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/summary.json` на wake и выдаёт первой строкой:

- PASS → «PR #N prod-check ✅ — открой screenshot тут … далее USER_CHECKLIST (Gate 5)»
- FAIL → «PR #N prod-check ❌ — упало <routes>, см. screenshot, нужен фикс»
