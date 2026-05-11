# Market Data Snapshots (manual CSV)

**Purpose:** weekly snapshots of market indices для Wave γ-04 (market-benchmark-full).
**Reason for manual:** платные API (Trading Economics, Baltic Exchange direct,
Drewry, Toepfer) стоят $200-2000/мес. До paying customer обновляем вручную раз в неделю.

## Files

| File                             | Source                            | Update frequency      | Format            |
| -------------------------------- | --------------------------------- | --------------------- | ----------------- |
| `bhsi-snapshots.csv`             | Baltic Exchange public            | weekly (Friday close) | `date,value,unit` |
| `toepfer-tmi-snapshots.csv`      | Toepfer Transport (public report) | weekly (Wednesday)    | `date,value,unit` |
| `drewry-breakbulk-snapshots.csv` | Drewry Shipping Insight (public)  | weekly                | `date,value,unit` |

## CSV format

```csv
date,value,unit,source_url
2026-05-09,1245,USD/day,https://www.balticexchange.com/en/data-services/market-information.html
2026-05-02,1198,USD/day,https://www.balticexchange.com/...
```

- `date` — ISO 8601 (YYYY-MM-DD), date of index value
- `value` — numeric value
- `unit` — `USD/day`, `points`, `EUR/ton`, etc.
- `source_url` — публичный URL откуда взято значение (для audit trail)

## Loading pipeline

Adapter `lib/market/manual-csv-loader.ts` (TBD) читает эти CSV при boot,
заливает в SQLite `baltic_indices` / `toepfer_indices` / `drewry_indices` таблицы.
Используется как fallback когда DB пустая или последний snapshot >7 дней.

## Update protocol

Раз в неделю (понедельник 09:00):

1. Открыть source URL (public report page)
2. Скопировать last week close value
3. Добавить строку в соответствующий CSV
4. `git commit -m "data(market): weekly snapshot YYYY-WW"`
5. `git push` (cron на VPS подхватит при deploy)

## Upgrade path

Когда выручка >€2000/мес от платных юзеров — подключить Trading Economics
API ($95/мес) или Baltic Exchange direct (~€500/мес) для автоматизации.
См. `docs/SERVICES-DEFERRED.md`.
