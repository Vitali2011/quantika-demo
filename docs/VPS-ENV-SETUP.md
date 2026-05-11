# VPS Environment Setup — Wave γ Scale Prerequisites

**Target:** `root@185.249.225.169` → `/root/quantika-demo/.env`

## Required env vars before Sprint 1

Перед запуском wave-pipeline-deep на γ-VS (vessel-search) — оба ключа должны быть в `.env` на VPS.

### 1. DATALASTIC_API_KEY (γ-VS)

**Регистрация** (15 минут, делает Виталий):

1. Открыть https://datalastic.com/pricing/
2. Выбрать **Starter €9 trial 14 days** (auto-converts to €99/mo)
3. Зарегистрироваться → получить API key в дашборде
4. **Скинуть key мне в чат** — я положу на VPS

**Verification после установки:**

```bash
ssh root@185.249.225.169 'curl -s "https://api.datalastic.com/api/v0/vessel_info?api-key=$DATALASTIC_API_KEY&imo=9456789" | jq .meta'
```

Ожидаем `{"success": true, "credits_remaining": <N>}`.

### 2. OPENSANCTIONS_API_KEY (γ-VS, β-09)

**Регистрация** (5 минут, делает Виталий):

1. https://www.opensanctions.org/api/ → "Get API key"
2. Email + accept ToS → free tier key приходит на email
3. Скинуть мне

**Verification:**

```bash
ssh root@185.249.225.169 'curl -s -H "Authorization: ApiKey $OPENSANCTIONS_API_KEY" "https://api.opensanctions.org/match/sanctions" -d "{\"queries\":{\"q1\":{\"schema\":\"Vessel\",\"properties\":{\"name\":[\"TEST\"]}}}}"'
```

## Установка ключей на VPS (после получения)

```bash
# Backup current .env
ssh root@185.249.225.169 'cp /root/quantika-demo/.env /root/quantika-demo/.env.backup-$(date +%Y%m%d)'

# Append new vars (single SSH session)
ssh root@185.249.225.169 'cat >> /root/quantika-demo/.env <<EOF

# Wave γ Scale prerequisites (added 2026-05-11)
DATALASTIC_API_KEY=<paste-here>
OPENSANCTIONS_API_KEY=<paste-here>
EOF'

# Restart PM2 to pick up env
ssh root@185.249.225.169 'pm2 restart quantika-demo --update-env'

# Smoke check
curl -fsSL https://demo.quantika.org/api/health
```

## Rollback

Если что-то сломалось:

```bash
ssh root@185.249.225.169 'cp /root/quantika-demo/.env.backup-YYYYMMDD /root/quantika-demo/.env && pm2 restart quantika-demo --update-env'
```

## Local dev setup

```bash
cd ~/work/quantika-demo
cp .env.local.example .env.local
# Edit DATALASTIC_API_KEY and OPENSANCTIONS_API_KEY
```

Никогда не коммитить `.env.local` или `.env` — только `.env.local.example` с пустыми значениями.
