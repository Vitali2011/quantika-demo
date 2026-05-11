# Services — Deferred & Approved Decisions

**Last updated:** 2026-05-11
**Owner:** Виталий (founder)
**Контекст:** решения по внешним сервисам для Wave γ Scale. Восстановлено после потери первоначального файла (1 мая 2026).

## ✅ Approved — подключаем сейчас (Wave γ Scale)

### Datalastic (vessel-search, AIS data)

- **План:** Starter — €99/мес (после €9 trial 14 дней)
- **URL:** https://datalastic.com/pricing/
- **Endpoints:** `vessel_in_area`, `vessel_info`, `vessel_pro`
- **Use case:** γ-VS vessel-search Phase 1 — основной AIS-провайдер
- **Архитектура:** уже есть `lib/ais/datalastic.ts` адаптер + cache + credit-guard
- **Env var:** `DATALASTIC_API_KEY` (set на VPS)
- **Phase 2 (post-PMF):** добавить AISstream.io WebSocket consumer как primary,
  Datalastic перевести в fallback enrichment → снижение OpEx €99 → €0-49/мес

### OpenSanctions (sanctions screening)

- **План:** Free tier (rate-limited, достаточно для MVP)
- **URL:** https://www.opensanctions.org/api/
- **Use case:** β-09 sanctions, γ-VS vessel-search санкционный фильтр
- **Env var:** `OPENSANCTIONS_API_KEY` (set на VPS)
- **Upgrade trigger:** >100 lookups/день → платный tier (~$50/мес)

## 📊 Manual CSV (вместо платных API)

### Market data — Toepfer TMI / BHSI / Drewry Breakbulk

- **Подход:** еженедельные snapshot'ы вручную в `lib/sample-data/market/`
- **Структура:** `lib/sample-data/market/<index>-snapshots.csv`
- **Update frequency:** раз в неделю (ручной cron в календаре)
- **Альтернатива:** Trading Economics API (~$95/мес) — отложено до paying customer

## 🗄 Архивировано — до paying customer

Все нижеперечисленные сервисы НЕ подключаем до первых платных юзеров.
Stub'ы / placeholder UI оставляем где уже есть в коде.

| Сервис                                               | Cost                  | Use case                              | Status кода                                                              |
| ---------------------------------------------------- | --------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| **Pipedrive** (CRM)                                  | $14/user/mo           | γ-08 subs-timer write-back, deal sync | Migration 009 + `lib/integrations/pipedrive/` — оставляем, не используем |
| **OpenAI Whisper** (voice memo)                      | usage-based           | β-15 voice fixture memo               | UI placeholder, no backend                                               |
| **ntfy.sh** (push alerts)                            | free self-hosted      | broker mobile push                    | Skip                                                                     |
| **Wise Business API**                                | free + per-tx fee     | γ-15 commission payouts               | Verification flow — отложен                                              |
| **Xero**                                             | $13/mo                | γ-15 commission invoicing             | Skip                                                                     |
| **SignWell**                                         | $8/mo                 | γ-14 e-signature CP                   | Skip                                                                     |
| **DocuSign**                                         | $50/mo                | альтернатива SignWell                 | Skip (дорого)                                                            |
| **Toepfer / Drewry / Baltic Exchange direct API**    | $200-2000/mo          | γ-04 market benchmark                 | Manual CSV instead                                                       |
| **Reuters / TradeWinds news API**                    | enterprise            | γ-13 counterparty news                | Skip (через Brave News free если нужно)                                  |
| **MarineTraffic API** (после Kpler enterprise pivot) | enterprise only       | альтернатива Datalastic               | Skip — Datalastic покрывает                                              |
| **VesselFinder API**                                 | €330/mo (10k credits) | альтернатива Datalastic               | Skip — Datalastic дешевле                                                |
| **Veson / Kpler IMOS**                               | enterprise NDA        | δ-06 voyage management bridge         | Wave δ только                                                            |
| **Spire Maritime**                                   | $thousands/mo         | satellite AIS                         | Wave δ только                                                            |

## 🔄 Spec-level decisions (Wave γ Scale)

### Архивированы из ROADMAP (8 спек)

- γ-06 sof-parser → **merged в γ-05** (laytime engine с SOF input)
- γ-10 ice-class-filter (нет Балтика/Арктика клиентов в MENA фокусе)
- γ-12 tone-per-recipient (не core; отложить в δ)
- γ-13 counterparty-intelligence (если нужно — через Brave News free)
- γ-14 signwell-esignature (до paying customer)
- γ-15 wise-xero-integration (до paying customer + Wise verification)
- γ-16 audit-log-pdf-export (до первого enterprise клиента)
- γ-17 apple-watch-complications (PWA push достаточно)

### Включены (11 спек)

γ-01, γ-02, γ-03 (full 3 MoU), γ-04, γ-05+06 merged, γ-07, γ-08 (без Pipedrive),
γ-09 (BIMCO via RAG), γ-11 (FuelEU), γ-18, **γ-VS** (vessel-search Datalastic).

## 📝 Update protocol

При изменении статуса любого сервиса:

1. Update этот файл (move row между секциями)
2. Update `docs/ROADMAP-WAVES.md` если меняется спека
3. Update memory (`~/.claude/projects/-Users-jarvis-claude/memory/MEMORY.md`)
4. Commit с message `docs(services): <service> → <new status>`
