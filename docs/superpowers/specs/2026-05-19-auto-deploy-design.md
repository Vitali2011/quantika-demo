# Auto-Deploy via GitHub Actions — QD + AL Parallel Wave (2026-05-19)

**Тип:** orchestrator session plan (cross-repo, prod-affecting)
**Repos:** `quantika-demo` + `allegro-lister`
**Target:** outreach-vps (185.249.225.169, root@) — обе services
**Создан:** 2026-05-19 после `/brainstorming` (3 подхода, 2 вопроса; user chose: QD+AL one wave, Health check + auto-rollback)

## Goal

После любого push в main каждой из 2 prod-repos:

1. **CI prerequisites green** (Build/Test/TypeCheck уже работают post-#253)
2. **Auto-deploy workflow триггерится** (новый файл `.github/workflows/deploy.yml`)
3. SSH к outreach-vps под deploy-only ключом → выполняется `~/deploy-<service>.sh`
4. **Скрипт сохраняет prev SHA**, делает `git pull`, install deps, build, `systemctl restart <service>`, ждёт 30 сек, `curl /api/health` (или `/health`)
5. **Если health != 200** в течение 60 сек → `git checkout <prev-sha>`, повторный restart, alert; exit 1 в workflow
6. Если зелёный — сохранить новый SHA в `~/.last-deployed-sha-<service>`, exit 0

End-state: human merge → ~2-3 мин → deploy complete OR auto-rollback. Zero ручных команд.

## Out of scope

- **wave-pipeline repo** — low activity, deferred (отдельная итерация если станет нужным)
- **Private repos** (claude-workspace-*, Friday, Jarvis) — not currently deploy targets
- **Multi-env staging** — у нас нет staging, прод напрямую. (Если возникнет — отдельный design.)
- **Blue/green / zero-downtime** — пока systemd restart с короткой паузой 1-3 сек. PWA + service workers могут смягчить (Phase 2).
- **DB migrations runner** — отдельный handler в deploy.sh, но рискованные миграции **не auto-deploy** — нужен tag `[migration]` который требует user approve (Rule 9 deploy-affects override).
- **Secrets rotation automation** — отдельный flow.
- **Sentry release tracking integration** — Phase 2, не блокирует MVP.

## Architecture — Hybrid GH Actions → Remote script

| Слой | Где | Что делает |
|---|---|---|
| Workflow `.github/workflows/deploy.yml` (в каждой repo) | GH Actions runner | На `push: branches: [main]` SSH'ится к outreach-vps под deploy key, запускает `~/deploy-<service>.sh` с переменной `$GITHUB_SHA` |
| `~/deploy-quantika-demo.sh` (на prod) | outreach-vps root@ | git pull, npm ci, npm build, systemctl restart, smoke, rollback on fail |
| `~/deploy-allegro-lister.sh` (на prod) | outreach-vps root@ | git pull, pip install, ruff check (опц.), systemctl restart, smoke, rollback on fail |
| GH Secret `PROD_SSH_KEY` (in repo settings) | Encrypted | Private key только для deploy (не root MacBook key) |
| `~/.ssh/authorized_keys` on prod | outreach-vps root@ | Public key with `command=` forcing — может запускать ТОЛЬКО `deploy-<service>.sh` |

### Зачем именно эта архитектура

Из 3 подходов в brainstorm:

- **A (Pure GH Actions SSH inline):** все команды в workflow YAML — tight coupling между CI и SSH, sloppy rollback. Отказался.
- **B (Hybrid — выбран):** workflow вызывает `deploy-<service>.sh`, скрипт делает всю работу. Можно ssh'нуться и manually запустить тот же скрипт. Чистая separation of concerns.
- **C (Cron polling):** prod каждые N мин tянет main — простой, но lag и нет immediate rollback.

## Deploy script contract — `deploy-<service>.sh`

### Args / env

```
deploy-quantika-demo.sh [--rollback]
                        [--skip-smoke]
                        [--prev-sha=<sha>]    # for rollback target
$GITHUB_SHA             # commit being deployed (from workflow)
```

### Flow (normal deploy)

```
1. cd /root/quantika-demo (или /root/allegro-lister)
2. PREV_SHA=$(git rev-parse HEAD)
3. echo $PREV_SHA > ~/.last-deployed-sha-<service>.bak   # safety
4. git fetch origin main && git reset --hard origin/main
5. (QD) npm ci --omit=dev || npm ci
   (AL) source .venv/bin/activate && pip install -r requirements.txt
6. (QD) NODE_OPTIONS='--max-old-space-size=8192' npm run build
   (AL) ruff check . || true
7. systemctl restart <service>
8. sleep 30   # warmup
9. health_check() — curl с timeout 5s, retry 6 раз с интервалом 10s = 60 sec total
   QD: curl https://demo.quantika.org/api/health → expect 200
   AL: curl https://allegro.quantika.org/health → expect 200
10. Если health green → echo $GITHUB_SHA > ~/.last-deployed-sha-<service>, exit 0
11. Если health red → goto Rollback
```

### Flow (rollback)

```
1. PREV_SHA=$(cat ~/.last-deployed-sha-<service>.bak)
2. log: "ROLLBACK to $PREV_SHA"
3. git reset --hard $PREV_SHA
4. (re-install deps + rebuild if needed — для AL deps могут не сходиться backward)
5. systemctl restart <service>
6. sleep 15
7. health_check (single try)
8. Если green → log success, exit 1 (deploy failed, но prod restored)
9. Если red — ALERT critical (manual intervention), exit 2
```

### Idempotency

- `~/.last-deployed-sha-<service>` хранится. Двойной запуск с тем же SHA = no-op (если git HEAD уже на нём).
- `--rollback` без аргумента читает `.bak` файл.
- Concurrent runs — `flock` на `~/.deploy-<service>.lock` (60s timeout).

## Workflow file — `.github/workflows/deploy.yml` (per repo)

```yaml
name: Deploy to prod

on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '*.md'
      - '.claude/**'
      - '.github/**'      # workflow changes alone don't deploy

permissions:
  contents: read

concurrency:
  group: deploy-prod         # only one deploy at a time per repo
  cancel-in-progress: false  # let in-flight finish

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.PROD_SSH_KEY }}
      - name: Trust prod host
        run: ssh-keyscan -H 185.249.225.169 >> ~/.ssh/known_hosts
      - name: Deploy
        run: |
          ssh root@185.249.225.169 "~/deploy-<service>.sh ${{ github.sha }}"
```

`<service>` = `quantika-demo` или `allegro-lister`.

## SSH key + authorized_keys на prod

### Создание deploy-only keypair

```bash
# Локально или на prod:
ssh-keygen -t ed25519 -f deploy-quantika-demo -C "github-actions-deploy" -N ""
ssh-keygen -t ed25519 -f deploy-allegro-lister -C "github-actions-deploy" -N ""
```

Private keys → GitHub Settings → Repository Secrets → `PROD_SSH_KEY` (per repo).

### Forced command в authorized_keys (security hardening)

```
command="bash -c '/root/deploy-quantika-demo.sh $SSH_ORIGINAL_COMMAND'",no-pty,no-X11-forwarding ssh-ed25519 AAAA... github-actions-quantika
command="bash -c '/root/deploy-allegro-lister.sh $SSH_ORIGINAL_COMMAND'",no-pty,no-X11-forwarding ssh-ed25519 AAAA... github-actions-allegro
```

`$SSH_ORIGINAL_COMMAND` — это `<sha>` от workflow. Скрипт принимает его как `$1 = GITHUB_SHA`. Если ключ leak'нут — атакующий может ТОЛЬКО запустить deploy script с произвольным SHA arg (всё ещё опасно — может deploy attacker fork; mitigation в Phase 2 — verify SHA принадлежит нашему remote).

## Health check endpoints

| Service | URL | Expected |
|---|---|---|
| quantika-demo | `https://demo.quantika.org/api/health` | HTTP 200, JSON `{status:"ok"}` (predicted; verify) |
| allegro-lister | `https://allegro.quantika.org/health` | HTTP 200 (memory: project_allegro_lister_2026_05_19_full_day) |

Если actual response shape отличается — adapt в `deploy-*.sh` (например, проверять JSON через jq).

## Failure modes

| Симптом | Detection | Recovery |
|---|---|---|
| `npm ci` fails (lock conflict) | Exit code != 0 | Stop early, log; manual ssh required |
| Build OOM | exit 137 / OOM message | NODE_OPTIONS max-heap уже 8192; alert |
| `systemctl restart` fails | systemctl returns non-zero | Try rollback; if still fails — alert |
| `/health` returns 5xx | health_check after 60s | **Auto-rollback** |
| `/health` returns 200 but app broken (silent bug) | NOT detected by this design | Phase 2: sentry tail / log scan / canary endpoint |
| SSH timeout (network blip) | step times out | Workflow exits non-zero; manual retry |
| Lock contention (concurrent deploys) | flock fails | Workflow concurrency group prevents in CI; on prod `flock` 60s wait |

## Implementation plan — 2 parallel chip-tasks

### Chip A — quantika-demo auto-deploy

Steps:
1. Create deploy-only ed25519 key pair locally
2. Add public key to `/root/.ssh/authorized_keys` on outreach-vps with `command=` restriction
3. Add `~/deploy-quantika-demo.sh` on outreach-vps (idempotent, --rollback, flock)
4. Create branch `ci/auto-deploy` в QD repo
5. Add `.github/workflows/deploy.yml`
6. Verify `gh secret list` on QD; if `PROD_SSH_KEY` missing — `gh secret set PROD_SSH_KEY < private_key.pem`
7. Test deploy.sh manually на prod (dry-run with `--skip-smoke` flag)
8. Open PR with `[code-only]` tag → auto-merge через PR #255 workflow → push в main triggers deploy.yml → проверить self-deploy
9. Smoke /api/health после auto-deploy → 200
10. Verify `.last-deployed-sha-quantika-demo` updated

### Chip B — allegro-lister auto-deploy (parallel)

Тот же template, но:
- `~/deploy-allegro-lister.sh` (Python вместо Node)
- Path `/root/allegro-lister/`
- `pip install` через venv (см. memory: `project_allegro_lister_2026_05_19_full_day` — fail2ban contemporary issue)
- Health URL `https://allegro.quantika.org/health`
- Service name `allegro-lister`
- Public key в том же authorized_keys (но separate entry с separate command= для безопасности)

Чипы запускаются параллельно. На outreach-vps файлы скрипты не конфликтуют (разные сервисы), но **authorized_keys** общий — race condition при одновременном append. Mitigation: один из чипов делает edit, second ждёт.

**Coordination через state.md:** оба чипа пишут `[HH:MM] DEPLOY-SETUP <service> step=<N>` в `~/orchestrator-state/<service>/state.md`. Если другой чип видит, что peer на authorized_keys step (5) — ждёт через `flock /root/.ssh/.authorized-keys.lock`.

## Risks + mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SSH key leak from GH secret | Attacker может trigger deploy любого SHA | Forced command + no-pty; Phase 2: SHA validation в deploy.sh |
| First deploy ломает prod (bug in workflow or script) | Downtime | Test deploy.sh manually FIRST (step 7); первый workflow run на trivial change |
| Health check 200 but real bug | False success, deploy proceeds | Phase 2: sentry release tracking; canary endpoint |
| Race conditions с manual `git pull && systemctl restart` | Я вручную deploy'ю concurrent с GH Actions | `flock` 60s; orchestrator-day instructions: stop manual deploys after this lands |
| Two repos race on authorized_keys edit | First-write-wins, second loses entry | Sequential chip dispatch OR explicit ordering: QD first, AL after |
| Disk fill from build artifacts | `npm run build` накапливает `.next/cache` | `deploy.sh`: `du -sh ~/.next/cache && rm -rf ~/.next/cache` если > 1GB; weekly cron cleanup |

## Acceptance — каждый repo (после chip merge)

1. `~/.last-deployed-sha-<service>` существует, содержит current main HEAD
2. `gh secret list -R <repo>` показывает `PROD_SSH_KEY`
3. `.github/workflows/deploy.yml` в main
4. Manual test: ssh outreach-vps `~/deploy-<service>.sh <some-sha>` — completes без errors
5. Real PR cycle: open `[code-only]` PR → auto-merge → push to main → workflow fires → deploy complete → /health 200 — без ручных команд
6. Rollback test (Phase 1+ если возможно safely): искуственно `npm ci` fail в deploy.sh → verify rollback restores prev SHA

## Estimated timing

- Per-chip: ~60-90 мин (включая SSH key setup, manual test, real cycle verify)
- Parallel: ~90 мин total wall-clock (race conditions учтены)
- My-side: ~10-15 мин на dispatch + monitor heartbeats

## Memory + ROADMAP updates после landing

- ROADMAP §3: добавить «Auto-deploy LIVE 2026-05-19 (QD + AL)» в "Что изменилось"
- Memory: `feedback_post_merge_deploy_authorized` обновить — «больше не нужно после auto-deploy LIVE»
- Memory new: `project_quantika_demo_auto_deploy_2026_05_19` + `project_allegro_lister_auto_deploy_2026_05_19` (или общая)
- Orchestrator-day Rule 9 update: deploy-affects glob теперь должен исключать `.github/workflows/deploy.yml` (это сам workflow — если он fails, prod не страдает, fail в CI только)

---

🤖 Сгенерировано через `superpowers:brainstorming` + Tier L plan-then-dispatch. Out-of-scope блок явный, Rule 13 brainstorm применён.
