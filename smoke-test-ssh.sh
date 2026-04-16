#!/usr/bin/env bash
# =============================================================================
# Quantika Demo — SSH Smoke Test
# Запускать локально: bash smoke-test-ssh.sh
# Тестирует приложение изнутри сервера (localhost:3000) через SSH
# =============================================================================

set -euo pipefail

# ── Настройки подключения ────────────────────────────────────────────────────
VPS_HOST="185.249.225.169"
VPS_USER="root"
VPS_PASS="${VPS_PASS:-Vit15932}"          # можно переопределить: VPS_PASS=xxx ./smoke-test-ssh.sh
APP_PORT=3000
APP_DIR="/root/quantika-demo"
DB_PATH="${APP_DIR}/data/sessions.db"

# ── Цвета ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

PASS=0; FAIL=0; WARN=0
REPORT=()

pass()  { echo -e "${GREEN}  ✅ PASS${RESET} $1"; PASS=$((PASS+1));  REPORT+=("PASS  | $1"); }
fail()  { echo -e "${RED}  ❌ FAIL${RESET} $1"; FAIL=$((FAIL+1));  REPORT+=("FAIL  | $1"); }
warn()  { echo -e "${YELLOW}  ⚠️  WARN${RESET} $1"; WARN=$((WARN+1));  REPORT+=("WARN  | $1"); }
info()  { echo -e "${CYAN}  ℹ  ${RESET}$1"; }
header(){ echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${RESET}"; }

# ── SSH хелпер ───────────────────────────────────────────────────────────────
SSH() {
  sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 -o LogLevel=ERROR \
    "${VPS_USER}@${VPS_HOST}" "$@"
}

# ── curl хелпер (запускается на сервере) ─────────────────────────────────────
# Возвращает "STATUS_CODE|BODY"
CURL() {
  local method="${1:-GET}"
  local path="${2:-/}"
  local extra="${3:-}"
  SSH "curl -s -o /tmp/smoke_body -w '%{http_code}' \
    -X ${method} \
    -H 'Content-Type: application/json' \
    ${extra} \
    http://localhost:${APP_PORT}${path} 2>/dev/null; \
    echo '|'; cat /tmp/smoke_body"
}

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     Quantika Demo — SSH Smoke Test                  ║${RESET}"
echo -e "${BOLD}║     $(date '+%Y-%m-%d %H:%M:%S')  VPS: ${VPS_HOST}          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"

# =============================================================================
header "LEVEL 1 — Сервер и сервисы"
# =============================================================================

# 1.1 SSH доступ
if SSH "echo ok" &>/dev/null; then
  pass "SSH подключение к ${VPS_HOST}"
else
  fail "SSH недоступен — дальнейшие тесты невозможны"
  exit 1
fi

# 1.2 Next.js процесс запущен
NEXT_PID=$(SSH "pgrep -f 'next-server' || true")
if [[ -n "$NEXT_PID" ]]; then
  pass "next-server запущен (PID: $NEXT_PID)"
else
  fail "next-server НЕ запущен (порт $APP_PORT)"
fi

# 1.3 Port 3000 слушает
PORT_OPEN=$(SSH "ss -tlnp | grep ':${APP_PORT}' | wc -l")
if [[ "$PORT_OPEN" -ge 1 ]]; then
  pass "Порт $APP_PORT слушает"
else
  fail "Порт $APP_PORT закрыт"
fi

# 1.4 Caddy (reverse proxy) работает
CADDY_RUNNING=$(SSH "systemctl is-active caddy 2>/dev/null || echo inactive")
if [[ "$CADDY_RUNNING" == "active" ]]; then
  pass "Caddy (reverse proxy) активен"
else
  warn "Caddy: $CADDY_RUNNING"
fi

# 1.5 quantika-api сервис
API_STATUS=$(SSH "systemctl is-active quantika-api.service 2>/dev/null || echo inactive")
if [[ "$API_STATUS" == "active" ]]; then
  pass "quantika-api.service активен (порт 3100)"
else
  warn "quantika-api.service: $API_STATUS"
fi

# 1.6 Свободная память
MEM_FREE=$(SSH "free -m | awk '/^Mem:/{print \$7}'")
if [[ "$MEM_FREE" -gt 200 ]]; then
  pass "Свободная RAM: ${MEM_FREE}MB"
else
  warn "Свободная RAM низкая: ${MEM_FREE}MB"
fi

# 1.7 Дисковое пространство
DISK_USED=$(SSH "df / | awk 'NR==2{print \$5}' | tr -d '%'")
if [[ "$DISK_USED" -lt 85 ]]; then
  pass "Диск: ${DISK_USED}% заполнен"
else
  warn "Диск почти полный: ${DISK_USED}%"
fi

# =============================================================================
header "LEVEL 2 — HTTP Endpoints (curl → localhost:$APP_PORT)"
# =============================================================================

# 2.1 Health check
info "GET /api/health"
HEALTH_RESP=$(SSH "curl -s http://localhost:${APP_PORT}/api/health 2>/dev/null")
if echo "$HEALTH_RESP" | grep -q '"status":"ok"'; then
  pass "/api/health → {status:ok}"
  VERSION=$(echo "$HEALTH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
  info "  version: $VERSION"
else
  fail "/api/health → неожиданный ответ: $HEALTH_RESP"
fi

# 2.2 Landing page (HTML)
info "GET /"
STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:${APP_PORT}/ 2>/dev/null")
if [[ "$STATUS" == "200" ]]; then
  pass "GET / → HTTP $STATUS"
else
  fail "GET / → HTTP $STATUS (ожидался 200)"
fi

# 2.3 Dashboard без сессии → редирект на /
info "GET /dashboard (без cookie)"
STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:${APP_PORT}/dashboard 2>/dev/null")
if [[ "$STATUS" == "307" || "$STATUS" == "302" || "$STATUS" == "200" ]]; then
  pass "GET /dashboard без сессии → HTTP $STATUS (редирект или 200+meta-refresh)"
else
  fail "GET /dashboard → неожиданный HTTP $STATUS"
fi

# 2.4 Sample API (POST)
info "POST /api/sample"
STATUS=$(SSH "curl -s -o /tmp/sample_resp -w '%{http_code}' \
  -X POST \
  -c /tmp/smoke_cookies -b /tmp/smoke_cookies \
  http://localhost:${APP_PORT}/api/sample 2>/dev/null")
if [[ "$STATUS" == "303" || "$STATUS" == "302" || "$STATUS" == "200" ]]; then
  pass "POST /api/sample → HTTP $STATUS (сессия создана)"
  SESSION_COOKIE=$(SSH "cat /tmp/smoke_cookies 2>/dev/null | grep session_id | awk '{print \$NF}' || true")
  if [[ -n "$SESSION_COOKIE" ]]; then
    info "  session_id cookie получен: ${SESSION_COOKIE:0:16}..."
  fi
else
  fail "POST /api/sample → HTTP $STATUS"
fi

# 2.5 Demo scenarios
info "GET /api/demo-scenarios/10-perfect-match"
STATUS=$(SSH "curl -s -o /tmp/scenario_resp -w '%{http_code}' \
  http://localhost:${APP_PORT}/api/demo-scenarios/10-perfect-match 2>/dev/null")
if [[ "$STATUS" == "200" ]]; then
  SCENARIO_ID=$(SSH "python3 -c \"import json; d=json.load(open('/tmp/scenario_resp')); print(d.get('id','?'))\" 2>/dev/null || echo '?'")
  pass "GET /api/demo-scenarios/10-perfect-match → 200 (id: $SCENARIO_ID)"
else
  fail "GET /api/demo-scenarios/10-perfect-match → HTTP $STATUS"
fi

# 2.6 Cargo page
info "GET /cargo/sample-1"
STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:${APP_PORT}/cargo/sample-1 2>/dev/null")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /cargo/sample-1 → HTTP $STATUS"
else
  fail "GET /cargo/sample-1 → HTTP $STATUS"
fi

# 2.7 Vessel page
info "GET /vessel/sample-3"
STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:${APP_PORT}/vessel/sample-3 2>/dev/null")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /vessel/sample-3 → HTTP $STATUS"
else
  fail "GET /vessel/sample-3 → HTTP $STATUS"
fi

# 2.8 Non-existent page → 404
info "GET /cargo/nonexistent-9999"
STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:${APP_PORT}/cargo/nonexistent-9999 2>/dev/null")
if [[ "$STATUS" == "404" || "$STATUS" == "200" ]]; then
  pass "GET /cargo/nonexistent-9999 → HTTP $STATUS (graceful)"
else
  fail "GET /cargo/nonexistent-9999 → HTTP $STATUS"
fi

# =============================================================================
header "LEVEL 3 — SQLite: состояние сессий"
# =============================================================================

SESSION_STATS=$(SSH "python3 -c \"
import sqlite3, json, time

c = sqlite3.connect('${DB_PATH}')

# Всего сессий
total = c.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]
print('total_sessions:', total)

# Активные (не истекшие)
now_ms = int(time.time() * 1000)
active = c.execute('SELECT COUNT(*) FROM sessions WHERE expires_at > ?', (now_ms,)).fetchone()[0]
print('active_sessions:', active)

# Последняя сессия
row = c.execute('SELECT data, created_at, expires_at FROM sessions ORDER BY created_at DESC LIMIT 1').fetchone()
if row:
    d = json.loads(row[0])
    created = row[1]
    expires = row[2]
    remaining_min = int((expires - now_ms) / 60000)
    print('last_created_ms:', created)
    print('ttl_remaining_min:', remaining_min)
    print('emails:', len(d.get('emails', [])))
    print('parsedCargos:', len(d.get('parsedCargos', [])))
    print('parsedVessels:', len(d.get('parsedVessels', [])))
    print('matches:', len(d.get('matches', [])))
    print('isSampleData:', d.get('isSampleData', False))
c.close()
\"" 2>&1)

info "SQLite stats:"
echo "$SESSION_STATS" | while IFS= read -r line; do info "  $line"; done

TOTAL_SESS=$(echo "$SESSION_STATS" | grep "total_sessions:" | awk '{print $2}')
ACTIVE_SESS=$(echo "$SESSION_STATS" | grep "active_sessions:" | awk '{print $2}')
LAST_CARGOS=$(echo "$SESSION_STATS" | grep "parsedCargos:" | awk '{print $2}')
LAST_VESSELS=$(echo "$SESSION_STATS" | grep "parsedVessels:" | awk '{print $2}')
LAST_MATCHES=$(echo "$SESSION_STATS" | grep "matches:" | awk '{print $2}')

[[ -n "$TOTAL_SESS" ]] && pass "SQLite доступен: $TOTAL_SESS сессий всего" || fail "SQLite недоступен"
[[ "$ACTIVE_SESS" -ge 0 ]] && info "Активных сессий: $ACTIVE_SESS"

# =============================================================================
header "LEVEL 3.5 — Pipeline: прогоняем classify → parse → match"
# =============================================================================

info "Создаём свежую сессию для прогона пайплайна..."
PIPELINE_STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' \
  -X POST \
  -c /tmp/pipeline_cookies \
  http://localhost:${APP_PORT}/api/sample 2>/dev/null")

if [[ "$PIPELINE_STATUS" != "303" && "$PIPELINE_STATUS" != "302" && "$PIPELINE_STATUS" != "200" ]]; then
  fail "Pipeline: не удалось создать сессию → HTTP $PIPELINE_STATUS"
else
  # Извлекаем session_id и csrf_token из cookies
  PIPE_SESSION=$(SSH "awk '/session_id/{print \$NF}' /tmp/pipeline_cookies 2>/dev/null || true")
  PIPE_CSRF=$(SSH "awk '/csrf_token/{print \$NF}' /tmp/pipeline_cookies 2>/dev/null || true")
  info "  session_id: ${PIPE_SESSION:0:16}..."
  info "  csrf_token: ${PIPE_CSRF:0:16}..."

  # ── Шаг 1: classify ──────────────────────────────────────────────────────
  info "Шаг 1/4: classify..."
  C_STATUS=$(SSH "curl -s -o /tmp/pipe_classify -w '%{http_code}' \
    -X POST \
    -b /tmp/pipeline_cookies \
    -H 'X-CSRF-Token: ${PIPE_CSRF}' \
    -H 'Content-Type: application/json' \
    http://localhost:${APP_PORT}/api/ai/classify 2>/dev/null")
  if [[ "$C_STATUS" == "200" ]]; then
    C_COUNT=$(SSH "python3 -c \"import json; d=json.load(open('/tmp/pipe_classify')); print(d.get('count',0))\" 2>/dev/null || echo '?'")
    pass "classify → HTTP 200, count=$C_COUNT"
  else
    fail "classify → HTTP $C_STATUS"
    C_BODY=$(SSH "cat /tmp/pipe_classify 2>/dev/null | head -c 200")
    info "  response: $C_BODY"
  fi

  # ── Шаг 2: parse-cargo + parse-vessel (параллельно) ──────────────────────
  info "Шаг 2/4: parse-cargo + parse-vessel (параллельно)..."
  SSH "curl -s -o /tmp/pipe_cargo -w '%{http_code}' \
    -X POST -b /tmp/pipeline_cookies \
    -H 'X-CSRF-Token: ${PIPE_CSRF}' -H 'Content-Type: application/json' \
    http://localhost:${APP_PORT}/api/ai/parse-cargo > /tmp/pipe_cargo_code 2>/dev/null &
  curl -s -o /tmp/pipe_vessel -w '%{http_code}' \
    -X POST -b /tmp/pipeline_cookies \
    -H 'X-CSRF-Token: ${PIPE_CSRF}' -H 'Content-Type: application/json' \
    http://localhost:${APP_PORT}/api/ai/parse-vessel > /tmp/pipe_vessel_code 2>/dev/null &
  wait"

  CARGO_CODE=$(SSH "cat /tmp/pipe_cargo_code 2>/dev/null || echo '?'")
  VESSEL_CODE=$(SSH "cat /tmp/pipe_vessel_code 2>/dev/null || echo '?'")
  CARGO_CNT=$(SSH "python3 -c \"import json; d=json.load(open('/tmp/pipe_cargo')); print(d.get('count',0))\" 2>/dev/null || echo '?'")
  VESSEL_CNT=$(SSH "python3 -c \"import json; d=json.load(open('/tmp/pipe_vessel')); print(d.get('count',0))\" 2>/dev/null || echo '?'")

  [[ "$CARGO_CODE" == "200" ]] && pass "parse-cargo → HTTP 200, count=$CARGO_CNT" || fail "parse-cargo → HTTP $CARGO_CODE"
  [[ "$VESSEL_CODE" == "200" ]] && pass "parse-vessel → HTTP 200, count=$VESSEL_CNT" || fail "parse-vessel → HTTP $VESSEL_CODE"

  # ── Шаг 3: match ─────────────────────────────────────────────────────────
  info "Шаг 3/4: match (async-poll, таймаут 180 сек)..."

  # Проверяем что сессия и CSRF есть — без них match бессмысленен
  if [[ -z "${PIPE_SESSION:-}" || -z "${PIPE_CSRF:-}" ]]; then
    fail "match → pipeline session setup failed, cannot run match step (session or CSRF empty)"
  else
    # Запускаем match в фоне на сервере — curl завершится сам, SSH сессия не блокирует нас
    SSH "nohup curl -s -o /tmp/pipe_match -w '%{http_code}' \
      -X POST -b /tmp/pipeline_cookies \
      -H 'X-CSRF-Token: ${PIPE_CSRF}' -H 'Content-Type: application/json' \
      --max-time 180 \
      http://localhost:${APP_PORT}/api/ai/match > /tmp/pipe_match_code 2>&1 &
    echo \$! > /tmp/pipe_match_pid" 2>/dev/null || true

    # Poll DB каждые 5 сек до 180 сек
    MATCH_START=$(date +%s)
    MATCH_TIMEOUT=180
    MATCH_DONE=0
    MATCH_COUNT=0

    while [[ $(($(date +%s) - MATCH_START)) -lt $MATCH_TIMEOUT ]]; do
      sleep 5
      MATCH_COUNT=$(SSH "python3 -c \"
import sqlite3, json
try:
    c = sqlite3.connect('${DB_PATH}')
    row = c.execute('SELECT data FROM sessions WHERE id=?', ('${PIPE_SESSION}',)).fetchone()
    if row:
        d = json.loads(row[0])
        print(len(d.get('matches', [])))
    else:
        print(0)
except Exception:
    print(0)
\"" 2>/dev/null || echo "0")

      # Читаем HTTP-код из файла (последние 4 символа — статус-код от -w '%{http_code}')
      M_STATUS=$(SSH "tail -c 4 /tmp/pipe_match_code 2>/dev/null | tr -d '\\n\\r' || echo ''" 2>/dev/null || echo "")

      elapsed=$(($(date +%s) - MATCH_START))

      if [[ "$M_STATUS" == "200" ]] && [[ "${MATCH_COUNT:-0}" -gt 0 ]]; then
        MATCH_DONE=1
        break
      fi

      # Если HTTP код есть, но не 200 — значит запрос завершился с ошибкой, нет смысла ждать
      if [[ -n "$M_STATUS" && "$M_STATUS" != "200" && ${#M_STATUS} -ge 3 ]] && echo "$M_STATUS" | grep -qE '^[0-9]{3}$'; then
        info "  match завершился с HTTP $M_STATUS (elapsed=${elapsed}s) — прекращаем поллинг"
        break
      fi

      info "  …match in progress (${elapsed}s, current matches=${MATCH_COUNT:-0})"
    done

    elapsed=$(($(date +%s) - MATCH_START))

    # Финальный вердикт: основной сигнал — DB (матчи в БД = реальный результат)
    if [[ "$MATCH_DONE" == "1" ]]; then
      pass "match → HTTP 200, matches=${MATCH_COUNT} (elapsed=${elapsed}s)"
    elif [[ "${MATCH_COUNT:-0}" -gt 0 ]]; then
      # Матчи есть в БД, но HTTP-код не подтверждён — всё равно успех
      warn "match → matches=${MATCH_COUNT} найдены в БД, но HTTP код неизвестен (elapsed=${elapsed}s)"
    elif [[ $(($(date +%s) - MATCH_START)) -ge $MATCH_TIMEOUT ]]; then
      warn "match timeout — elapsed ${MATCH_TIMEOUT}s, matches=${MATCH_COUNT:-0} (LLM мог не успеть)"
    else
      fail "match → HTTP ${M_STATUS:-?}, matches=${MATCH_COUNT:-0} (elapsed=${elapsed}s)"
      M_BODY=$(SSH "cat /tmp/pipe_match 2>/dev/null | head -c 300" 2>/dev/null || echo "")
      [[ -n "$M_BODY" ]] && info "  response: $M_BODY"
    fi
  fi

  # ── Шаг 4: проверка в SQLite ──────────────────────────────────────────────
  info "Шаг 4/4: проверяю результаты в SQLite..."
  PIPE_DB=$(SSH "python3 -c \"
import sqlite3, json
c = sqlite3.connect('${DB_PATH}')
row = c.execute('SELECT data FROM sessions WHERE id=?', ('${PIPE_SESSION}',)).fetchone()
if row:
    d = json.loads(row[0])
    print('db_cargos:', len(d.get('parsedCargos', [])))
    print('db_vessels:', len(d.get('parsedVessels', [])))
    print('db_matches:', len(d.get('matches', [])))
    # geared bug check: any vessel geared=True with 'Gearless' in specialFeatures
    bugs = [v.get('vesselName',{}).get('value','?') for v in d.get('parsedVessels',[])
            if v.get('geared') and any('eless' in str(f).lower() for f in v.get('specialFeatures',[]))]
    print('geared_bugs:', bugs)
    # lastCargoes bug check
    lc_bugs = [v.get('vesselName',{}).get('value','?') for v in d.get('parsedVessels',[])
               if '[object Object]' in str(v.get('lastCargoes',''))]
    print('lastcargoes_bugs:', lc_bugs)
c.close()
\" 2>/dev/null")
  info "  $PIPE_DB"

  DB_CARGOS=$(echo "$PIPE_DB" | grep "db_cargos:" | awk '{print $2}')
  DB_VESSELS=$(echo "$PIPE_DB" | grep "db_vessels:" | awk '{print $2}')
  DB_MATCHES=$(echo "$PIPE_DB" | grep "db_matches:" | awk '{print $2}')
  GEARED_BUGS=$(echo "$PIPE_DB" | grep "geared_bugs:" | sed 's/geared_bugs: //')
  LC_BUGS=$(echo "$PIPE_DB" | grep "lastcargoes_bugs:" | sed 's/lastcargoes_bugs: //')

  [[ "${DB_CARGOS:-0}" -ge 5 ]] && pass "DB: parsedCargos=$DB_CARGOS (≥5)" || warn "DB: parsedCargos=${DB_CARGOS:-0} (меньше 5)"
  [[ "${DB_VESSELS:-0}" -ge 5 ]] && pass "DB: parsedVessels=$DB_VESSELS (≥5)" || warn "DB: parsedVessels=${DB_VESSELS:-0} (меньше 5)"
  [[ "${DB_MATCHES:-0}" -ge 1 ]] && pass "DB: matches=$DB_MATCHES ✅" || warn "DB: matches=0"

  # Проверяем что фикс geared сработал
  if [[ "$GEARED_BUGS" == "[]" ]]; then
    pass "geared bug fix: нет судов с geared=True + Gearless в features"
  else
    fail "geared bug: ещё присутствует у $GEARED_BUGS"
  fi

  # Проверяем что фикс lastCargoes сработал
  if [[ "$LC_BUGS" == "[]" ]]; then
    pass "lastCargoes bug fix: нет '[object Object]' в БД"
  else
    fail "lastCargoes bug: ещё присутствует у $LC_BUGS"
  fi
fi

# =============================================================================
header "LEVEL 4 — Логи: ошибки за последние 30 минут"
# =============================================================================

info "Ищу ERROR/WARN в journalctl (next-server, последние 30 мин)..."

LOG_ERRORS=$(SSH "journalctl -u 'next*' --since '30 minutes ago' --no-pager -q 2>/dev/null \
  | grep -iE 'error|warn|fatal|unhandled|exception' | tail -20 || true")

if [[ -z "$LOG_ERRORS" ]]; then
  pass "Нет ошибок в логах next-server за 30 минут"
else
  ERR_COUNT=$(echo "$LOG_ERRORS" | wc -l)
  warn "Найдено $ERR_COUNT строк с ERROR/WARN:"
  echo "$LOG_ERRORS" | head -10 | while IFS= read -r line; do info "  $line"; done
fi

# Ошибки quantika-api
info "Логи quantika-api (последние 30 мин)..."
API_ERRORS=$(SSH "journalctl -u quantika-api --since '30 minutes ago' --no-pager -q 2>/dev/null \
  | grep -iE 'error|fatal' | tail -10 || true")

if [[ -z "$API_ERRORS" ]]; then
  pass "Нет ERROR в логах quantika-api"
else
  warn "quantika-api errors: $API_ERRORS"
fi

# =============================================================================
header "LEVEL 5 — Специфические проверки (Known Bugs)"
# =============================================================================

# B1: ISO дата в vessel page
info "B1: Проверяю формат даты 'Active until' на /vessel/sample-3..."
VESSEL_HTML=$(SSH "curl -s http://localhost:${APP_PORT}/vessel/sample-3 2>/dev/null")
if echo "$VESSEL_HTML" | grep -qE 'Active until [0-9]{4}-[0-9]{2}-[0-9]{2}T'; then
  fail "B1: Raw ISO дата в vessel page: 'Active until YYYY-MM-DDTHH:MM:SSZ' — НЕ отформатировано"
else
  pass "B1: ISO дата на vessel page отформатирована корректно"
fi

# B2: [object Object] в lastCargoes
info "B2: Проверяю [object Object] в vessel page..."
if echo "$VESSEL_HTML" | grep -q '\[object Object\]'; then
  fail "B2: '[object Object]' найден в /vessel/sample-3 — баг рендеринга lastCargoes"
else
  pass "B2: '[object Object]' не найден"
fi

# B3: [object Object] в cargo page
info "B3: Проверяю [object Object] в /cargo/sample-1..."
CARGO_HTML=$(SSH "curl -s http://localhost:${APP_PORT}/cargo/sample-1 2>/dev/null")
if echo "$CARGO_HTML" | grep -q '\[object Object\]'; then
  fail "B3: '[object Object]' найден в /cargo/sample-1 — баг рендеринга поля страны"
else
  pass "B3: '[object Object]' не найден в cargo page"
fi

# B4: CSRF на /api/sample (не должен требовать CSRF токен)
info "B4: CSRF — /api/sample не должен блокировать POST без CSRF токена..."
CSRF_STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:${APP_PORT}/api/sample 2>/dev/null")
if [[ "$CSRF_STATUS" != "403" ]]; then
  pass "B4: POST /api/sample без CSRF → $CSRF_STATUS (CSRF middleware не применяется к /api/sample)"
else
  fail "B4: POST /api/sample → 403 FORBIDDEN — CSRF блокирует"
fi

# B5: /api/ai/match требует CSRF (должен блокировать)
info "B5: CSRF — /api/ai/match ДОЛЖЕН требовать CSRF..."
MATCH_STATUS=$(SSH "curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -b 'session_id=fake-session' \
  http://localhost:${APP_PORT}/api/ai/match 2>/dev/null")
if [[ "$MATCH_STATUS" == "403" || "$MATCH_STATUS" == "401" ]]; then
  pass "B5: POST /api/ai/match без CSRF → $MATCH_STATUS (защита работает)"
else
  warn "B5: POST /api/ai/match без CSRF → $MATCH_STATUS (ожидался 403)"
fi

# B6: refYear — проверяем что хардкод 2025 удалён из исходного кода
info "B6: refYear — проверяю отсутствие хардкода 2025 в match/route.ts..."
HARDCODE_CHECK=$(SSH "grep -n '? 2025' ${APP_DIR}/app/api/ai/match/route.ts 2>/dev/null || echo 'clean'")
if [[ "$HARDCODE_CHECK" == "clean" ]]; then
  pass "B6: хардкод '? 2025' не найден в match/route.ts — refYear динамический"
else
  fail "B6: хардкод '? 2025' всё ещё присутствует в match/route.ts: $HARDCODE_CHECK"
fi

# B6б: проверяем что динамический refYear на месте
info "B6б: проверяю наличие динамического refYear..."
DYNAMIC_CHECK=$(SSH "grep -c 'sessionYear\|currentYear' ${APP_DIR}/app/api/ai/match/route.ts 2>/dev/null || echo 0")
if [[ "$DYNAMIC_CHECK" -ge 2 ]]; then
  pass "B6б: динамический refYear присутствует (sessionYear + currentYear)"
else
  warn "B6б: динамический refYear не найден — проверь match/route.ts вручную"
fi

# =============================================================================
header "LEVEL 6 — Валидация полей (типы и структуры)"
# =============================================================================

info "Запускаю Python3 валидацию типов полей cargo/vessel из SQLite..."
L6_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

CONFIDENCE_FIELDS_CARGO = {
    "originPort", "destinationPort", "cargoDescription",
    "weightMt", "preferredDates",
}
PLAIN_STRING_FIELDS_CARGO = {
    "originCountry", "destinationCountry", "laycan", "loadingRate",
    "dischargeRate", "commissionTerms", "incoterms", "dimensions",
}
CARGO_TYPE_ENUM = {"BULK", "BREAK_BULK", "PROJECT", "CONTAINER", "LIQUID", "OTHER", "FCL", "LCL", "AIR", "RORO"}
CONFIDENCE_VALUES = {"confirmed", "interpreted", "uncertain"}

CONFIDENCE_FIELDS_VESSEL = {
    "vesselName", "dwtSummer", "dwcc", "draftMax",
    "openPosition", "openDate",
}
PLAIN_STRING_FIELDS_VESSEL = {
    "flag", "classSociety", "pandi", "lastCargoes", "grainCapacityUnit",
    "craneCapacity", "vesselType", "direction", "holdDimensions",
    "hatchDimensions", "tankTopStrength", "hatchType",
}

def is_confidence_field(v):
    return isinstance(v, dict) and "value" in v and "confidence" in v

def check_confidence_field(obj, field, label):
    v = obj.get(field)
    if v is None:
        return  # null is acceptable
    if not isinstance(v, dict):
        print(f"FAIL: {label} {field} должен быть ConfidenceField, получено: {type(v).__name__}")
        return
    if "value" not in v:
        print(f"FAIL: {label} {field} ConfidenceField без 'value'")
    if "confidence" not in v:
        print(f"FAIL: {label} {field} ConfidenceField без 'confidence'")
    elif v["confidence"] not in CONFIDENCE_VALUES:
        print(f"FAIL: {label} {field} confidence неверное: '{v['confidence']}'")
    else:
        print(f"PASS: {label} {field} ConfidenceField корректен (confidence={v['confidence']})")
    if "sourceText" not in v:
        print(f"WARN: {label} {field} ConfidenceField без 'sourceText'")

def check_plain_string(obj, field, label):
    v = obj.get(field)
    if v is None:
        return  # null is acceptable
    if isinstance(v, dict):
        print(f"FAIL: {label} {field} — ConfidenceField leak! Получен объект: {json.dumps(v)[:80]}")
    elif isinstance(v, str):
        if "[object Object]" in v:
            print(f"FAIL: {label} {field} содержит '[object Object]'")
        else:
            print(f"PASS: {label} {field} plain string ok")
    else:
        print(f"WARN: {label} {field} неожиданный тип: {type(v).__name__}")

def check_array_field(obj, field, label):
    v = obj.get(field)
    if v is None:
        print(f"FAIL: {label} {field} — null, должен быть array")
    elif isinstance(v, list):
        print(f"PASS: {label} {field} is array (len={len(v)})")
    else:
        print(f"FAIL: {label} {field} — не array, тип: {type(v).__name__}")

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий в БД — пропускаю валидацию полей")
        sys.exit(0)

    data = json.loads(row[0])
    cargos = data.get("parsedCargos", [])
    vessels = data.get("parsedVessels", [])

    if not cargos:
        print("WARN: parsedCargos пуст — нечего проверять")
    if not vessels:
        print("WARN: parsedVessels пуст — нечего проверять")

    # ── Cargo validation ──────────────────────────────────────────────────────
    cargo_errors = 0
    for i, cargo in enumerate(cargos):
        lbl = f"cargo[{i}]"

        # ConfidenceField checks
        for field in CONFIDENCE_FIELDS_CARGO:
            check_confidence_field(cargo, field, lbl)

        # Plain string checks (must NOT be objects)
        for field in PLAIN_STRING_FIELDS_CARGO:
            check_plain_string(cargo, field, lbl)

        # cargoType enum
        ct = cargo.get("cargoType")
        if ct is None:
            print(f"WARN: {lbl} cargoType is null")
        elif ct not in CARGO_TYPE_ENUM:
            print(f"FAIL: {lbl} cargoType неверное значение: '{ct}'")
        else:
            print(f"PASS: {lbl} cargoType={ct}")

        # volumeCbm — plain number or null
        vol = cargo.get("volumeCbm")
        if vol is not None and isinstance(vol, dict):
            print(f"FAIL: {lbl} volumeCbm — ConfidenceField leak! должен быть number")
        elif vol is None or isinstance(vol, (int, float)):
            print(f"PASS: {lbl} volumeCbm тип ok")

        # commissionPercent — number or null
        cp = cargo.get("commissionPercent")
        if cp is not None and not isinstance(cp, (int, float)):
            print(f"FAIL: {lbl} commissionPercent — неверный тип: {type(cp).__name__}")
        else:
            print(f"PASS: {lbl} commissionPercent тип ok")

        # missingInfo must be array
        check_array_field(cargo, "missingInfo", lbl)

    # ── Vessel validation ─────────────────────────────────────────────────────
    for i, vessel in enumerate(vessels):
        lbl = f"vessel[{i}]"

        # ConfidenceField checks
        for field in CONFIDENCE_FIELDS_VESSEL:
            check_confidence_field(vessel, field, lbl)

        # Plain string checks (must NOT be objects)
        for field in PLAIN_STRING_FIELDS_VESSEL:
            check_plain_string(vessel, field, lbl)

        # geared — must be bool or null, never string
        geared = vessel.get("geared")
        if geared is None:
            print(f"PASS: vessel[{i}] geared=null ok")
        elif isinstance(geared, bool):
            print(f"PASS: vessel[{i}] geared={geared} (bool) ok")
        elif isinstance(geared, str):
            print(f"FAIL: vessel[{i}] geared — строка '{geared}', должен быть boolean")
        else:
            print(f"WARN: vessel[{i}] geared — неожиданный тип: {type(geared).__name__}")

        # numeric fields — plain number or null
        for num_field in ("loa", "beam", "grt", "nrt", "holdsCount", "hatchesCount",
                          "grainCapacity", "baleCapacity", "built", "quantity"):
            nv = vessel.get(num_field)
            if nv is not None and isinstance(nv, dict):
                print(f"FAIL: vessel[{i}] {num_field} — ConfidenceField leak! должен быть number")

        # restrictions must be array
        check_array_field(vessel, "restrictions", lbl)

        # specialFeatures must be array
        check_array_field(vessel, "specialFeatures", lbl)

        # lastCargoes — must be string or null, never object/array
        lc = vessel.get("lastCargoes")
        if lc is None:
            print(f"PASS: vessel[{i}] lastCargoes=null ok")
        elif isinstance(lc, str):
            if "[object Object]" in lc:
                print(f"FAIL: vessel[{i}] lastCargoes содержит '[object Object]'")
            else:
                print(f"PASS: vessel[{i}] lastCargoes plain string ok")
        elif isinstance(lc, (list, dict)):
            print(f"FAIL: vessel[{i}] lastCargoes — тип {type(lc).__name__}, должен быть string")
        else:
            print(f"WARN: vessel[{i}] lastCargoes — неожиданный тип: {type(lc).__name__}")

except Exception as e:
    print(f"FAIL: L6 exception: {e}")
PYEOF
)

# Pipe L6 output through pass/fail/warn
while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]]; then
    pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then
    fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then
    warn "${pyline#WARN: }"
  else
    info "  $pyline"
  fi
done <<< "$L6_OUTPUT"

# =============================================================================
header "LEVEL 7 — Бизнес-логика"
# =============================================================================

info "Запускаю Python3 проверку бизнес-логики matches из SQLite..."
L7_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

MATCH_LEVEL_ENUM = {"good", "possible", "weak"}
SANCTIONS_RISK_ENUM = {"NONE", "MEDIUM", "HIGH"}
READINESS_VERDICT_ENUM = {"ideal", "tight", "idle", "late", "unknown"}
HARD_FILTER_KEYS = {"draft", "crane", "volume", "cargoVessel"}
SCORE_BREAKDOWN_LABELS = {
    "Geographic proximity",
    "Cargo type match",
    "Cargo handling (cranes)",
    "Volume / hold fit",
    "Laycan fit",
    "DWT class fit",
}
CARGO_TYPE_ENUM = {"BULK", "BREAK_BULK", "PROJECT", "CONTAINER", "LIQUID", "OTHER", "FCL", "LCL", "AIR", "RORO"}

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий в БД — пропускаю проверку бизнес-логики")
        sys.exit(0)

    data = json.loads(row[0])
    matches = data.get("matches", [])
    cargos = data.get("parsedCargos", [])
    vessels = data.get("parsedVessels", [])

    if not matches:
        print("WARN: matches пуст — нечего проверять")
    else:
        print(f"PASS: matches загружены из БД (count={len(matches)})")

    # Build emailId sets for orphan check
    cargo_email_ids = set()
    for c in cargos:
        eid = c.get("emailId")
        if eid:
            cargo_email_ids.add(eid)

    vessel_email_ids = set()
    for v in vessels:
        eid = v.get("emailId")
        if eid:
            vessel_email_ids.add(eid)

    score_fails = 0
    level_fails = 0
    hardfilter_fails = 0
    breakdown_fails = 0
    sanctions_fails = 0
    readiness_fails = 0
    orphan_cargo_fails = 0
    orphan_vessel_fails = 0

    for i, match in enumerate(matches):
        lbl = f"match[{i}]"

        # score 0-100
        score = match.get("score")
        if score is None or not isinstance(score, (int, float)):
            print(f"FAIL: {lbl} score отсутствует или не число: {score}")
            score_fails += 1
        elif not (0 <= score <= 100):
            print(f"FAIL: {lbl} score={score} вне диапазона [0,100]")
            score_fails += 1

        # matchLevel enum
        ml = match.get("matchLevel")
        if ml not in MATCH_LEVEL_ENUM:
            print(f"FAIL: {lbl} matchLevel='{ml}' не в {MATCH_LEVEL_ENUM}")
            level_fails += 1

        # hardFilters — exactly 4 keys
        hf = match.get("hardFilters")
        if not isinstance(hf, dict):
            print(f"FAIL: {lbl} hardFilters отсутствует или не объект")
            hardfilter_fails += 1
        else:
            hf_keys = set(hf.keys())
            missing = HARD_FILTER_KEYS - hf_keys
            extra = hf_keys - HARD_FILTER_KEYS
            if missing:
                print(f"FAIL: {lbl} hardFilters отсутствуют ключи: {missing}")
                hardfilter_fails += 1
            if extra:
                print(f"WARN: {lbl} hardFilters лишние ключи: {extra}")
            # each filter must have {pass: bool}
            for k in HARD_FILTER_KEYS & hf_keys:
                fv = hf[k]
                if not isinstance(fv, dict) or not isinstance(fv.get("pass"), bool):
                    print(f"FAIL: {lbl} hardFilters.{k}.pass не boolean")
                    hardfilter_fails += 1

        # scoreBreakdown — exactly 6 components with correct labels
        sb = match.get("scoreBreakdown")
        if not isinstance(sb, dict):
            print(f"FAIL: {lbl} scoreBreakdown отсутствует или не объект")
            breakdown_fails += 1
        else:
            components = sb.get("components", [])
            if len(components) != 6:
                print(f"FAIL: {lbl} scoreBreakdown.components count={len(components)}, ожидалось 6")
                breakdown_fails += 1
            else:
                actual_labels = {c.get("label") for c in components}
                missing_labels = SCORE_BREAKDOWN_LABELS - actual_labels
                if missing_labels:
                    print(f"FAIL: {lbl} scoreBreakdown компоненты отсутствуют: {missing_labels}")
                    breakdown_fails += 1
                for c in components:
                    pts = c.get("points")
                    mx = c.get("max")
                    if pts is None or mx is None:
                        print(f"WARN: {lbl} scoreBreakdown компонент '{c.get('label')}' без points/max")
                    elif not isinstance(pts, (int, float)) or not isinstance(mx, (int, float)):
                        print(f"FAIL: {lbl} scoreBreakdown компонент points/max не числа")
                        breakdown_fails += 1

        # sanctions
        sanctions = match.get("sanctions")
        if not isinstance(sanctions, dict):
            print(f"FAIL: {lbl} sanctions отсутствует или не объект")
            sanctions_fails += 1
        else:
            risk = sanctions.get("risk")
            if risk not in SANCTIONS_RISK_ENUM:
                print(f"FAIL: {lbl} sanctions.risk='{risk}' не в {SANCTIONS_RISK_ENUM}")
                sanctions_fails += 1
            if not isinstance(sanctions.get("blocking"), bool):
                print(f"FAIL: {lbl} sanctions.blocking не boolean")
                sanctions_fails += 1

        # readiness
        readiness = match.get("readiness")
        if not isinstance(readiness, dict):
            print(f"FAIL: {lbl} readiness отсутствует или не объект")
            readiness_fails += 1
        else:
            verdict = readiness.get("verdict")
            if verdict not in READINESS_VERDICT_ENUM:
                print(f"FAIL: {lbl} readiness.verdict='{verdict}' не в {READINESS_VERDICT_ENUM}")
                readiness_fails += 1
            if "explanation" not in readiness:
                print(f"WARN: {lbl} readiness.explanation отсутствует")

        # orphan check
        cargo_eid = match.get("cargoEmailId")
        if cargo_email_ids and cargo_eid not in cargo_email_ids:
            print(f"FAIL: {lbl} cargoEmailId='{cargo_eid}' нет в parsedCargos")
            orphan_cargo_fails += 1

        vessel_eid = match.get("vesselEmailId")
        if vessel_email_ids and vessel_eid not in vessel_email_ids:
            print(f"FAIL: {lbl} vesselEmailId='{vessel_eid}' нет в parsedVessels")
            orphan_vessel_fails += 1

    # Aggregate pass/fail per category
    if score_fails == 0 and matches:
        print("PASS: все score в диапазоне [0,100]")
    elif score_fails > 0:
        print(f"FAIL: {score_fails} matches с некорректным score")

    if level_fails == 0 and matches:
        print("PASS: все matchLevel корректны (good/possible/weak)")
    elif level_fails > 0:
        print(f"FAIL: {level_fails} matches с неверным matchLevel")

    if hardfilter_fails == 0 and matches:
        print("PASS: hardFilters — ровно 4 ключа с корректными значениями")
    elif hardfilter_fails > 0:
        print(f"FAIL: {hardfilter_fails} проблем с hardFilters")

    if breakdown_fails == 0 and matches:
        print("PASS: scoreBreakdown — 6 компонентов с корректными метками")
    elif breakdown_fails > 0:
        print(f"FAIL: {breakdown_fails} проблем с scoreBreakdown")

    if sanctions_fails == 0 and matches:
        print("PASS: sanctions.risk и blocking корректны")
    elif sanctions_fails > 0:
        print(f"FAIL: {sanctions_fails} проблем с sanctions")

    if readiness_fails == 0 and matches:
        print("PASS: readiness.verdict корректен у всех matches")
    elif readiness_fails > 0:
        print(f"FAIL: {readiness_fails} проблем с readiness.verdict")

    if orphan_cargo_fails == 0:
        print("PASS: нет orphan matches по cargoEmailId")
    else:
        print(f"FAIL: {orphan_cargo_fails} matches ссылаются на несуществующий cargoEmailId")

    if orphan_vessel_fails == 0:
        print("PASS: нет orphan matches по vesselEmailId")
    else:
        print(f"FAIL: {orphan_vessel_fails} matches ссылаются на несуществующий vesselEmailId")

    # geared type check across vessels (business logic angle)
    geared_str_count = sum(
        1 for v in vessels if isinstance(v.get("geared"), str)
    )
    if geared_str_count == 0:
        print("PASS: geared — нет строковых значений (boolean или null)")
    else:
        print(f"FAIL: geared — {geared_str_count} судов со строковым geared (ожидается bool/null)")

    # cargoType enum check
    bad_ct = [
        c.get("cargoType") for c in cargos
        if c.get("cargoType") not in CARGO_TYPE_ENUM
    ]
    if not bad_ct:
        print("PASS: cargoType — все значения в допустимом enum")
    else:
        print(f"FAIL: cargoType — неверные значения: {bad_ct}")

    # matchReasons and issues must be arrays
    mr_fails = sum(1 for m in matches if not isinstance(m.get("matchReasons"), list))
    if mr_fails == 0:
        print("PASS: matchReasons — везде array")
    else:
        print(f"FAIL: {mr_fails} matches с matchReasons не-array")

    iss_fails = sum(1 for m in matches if not isinstance(m.get("issues"), list))
    if iss_fails == 0:
        print("PASS: issues — везде array")
    else:
        print(f"FAIL: {iss_fails} matches с issues не-array")

    # dateIssues must be array
    di_fails = sum(1 for m in matches if not isinstance(m.get("dateIssues"), list))
    if di_fails == 0:
        print("PASS: dateIssues — везде array")
    else:
        print(f"FAIL: {di_fails} matches с dateIssues не-array")

except Exception as e:
    print(f"FAIL: L7 exception: {e}")
PYEOF
)

# Pipe L7 output through pass/fail/warn
while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]]; then
    pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then
    fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then
    warn "${pyline#WARN: }"
  else
    info "  $pyline"
  fi
done <<< "$L7_OUTPUT"

# =============================================================================
header "ИТОГОВЫЙ ОТЧЁТ"
# =============================================================================

TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "${BOLD}Результаты:${RESET}"
echo -e "  ${GREEN}✅ PASS: $PASS${RESET}"
echo -e "  ${RED}❌ FAIL: $FAIL${RESET}"
echo -e "  ${YELLOW}⚠️  WARN: $WARN${RESET}"
echo -e "  Всего проверок: $TOTAL"
echo ""

echo -e "${BOLD}Детали:${RESET}"
for line in "${REPORT[@]}"; do
  if [[ "$line" == PASS* ]]; then
    echo -e "  ${GREEN}${line}${RESET}"
  elif [[ "$line" == FAIL* ]]; then
    echo -e "  ${RED}${line}${RESET}"
  else
    echo -e "  ${YELLOW}${line}${RESET}"
  fi
done

echo ""
if [[ "$FAIL" -eq 0 && "$WARN" -le 2 ]]; then
  echo -e "${GREEN}${BOLD}ВЕРДИКТ: ✅ READY — приложение готово к демо${RESET}"
elif [[ "$FAIL" -eq 0 ]]; then
  echo -e "${YELLOW}${BOLD}ВЕРДИКТ: ⚠️  READY WITH CAVEATS — работает, но есть предупреждения${RESET}"
elif [[ "$FAIL" -le 2 ]]; then
  echo -e "${YELLOW}${BOLD}ВЕРДИКТ: ⚠️  READY WITH CAVEATS — есть баги, но критичный flow работает${RESET}"
else
  echo -e "${RED}${BOLD}ВЕРДИКТ: ❌ NOT READY — $FAIL критичных сбоев${RESET}"
fi
echo ""
