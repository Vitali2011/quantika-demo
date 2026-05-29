## Port distances — accurate sea routing (Wave 5 backlog)

**Current state (v1.1.0):** `getPortDistance` возвращает `{ nm, exact }`. Для пар вне hardcoded matrix — haversine great-circle. Погрешность: Med/Baltic ~5-10%, transoceanic до 30% (vessel goes around Africa or via Panama Canal, haversine shows straight line).

**Planned:** Integration of searoutes.com API ($100/mo) OR npm `seaport-distance` for sea-routed distances.

**Estimate:** 1-2 days. Trigger: brokers complain about ETA miss >24h.

**Files:** `lib/sailing/port-distances.ts:getPortDistance`, UI `app/match/[id]/page.tsx`.

---

## Charterer Credit — Gmail Import (production-only)

**Scope:** **Production только.** На demo (`demo.quantika.org`) НЕ делаем — там достаточно текущего seed'а из 20 blue-chip имён (`scripts/knowledge/seeds/seed-charterers.ts`) для витрины. Feature flag `NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED` остаётся `true` на демо без изменений UI.

**Current state (2026-05-28):**

- Schema `charterers` (migration 026): name + tier (blue-chip/second/weak) + payment_history (JSON) + require_lc + notes. Repo: `lib/market/charterers-repository.ts`.
- UI `/charterers`: список + фильтр + сортировка + «+ Add Charterer» (работает, POST `/api/charterers`) + **«Import Gmail» — placeholder-кнопка без onClick** (см. QA-DB-06 в `docs/qa/dashboard-2026-05-28.md`).
- Seed: 20 blue-chip имён (tier='blue-chip'), без email/payment-history.
- **Нет источника данных для реальных брокеров.** Live-пользователь зайдёт — увидит витринный список 20 чужих компаний без своих контактов.

**Planned (production):** допилить «Import Gmail» — парсить адресатов/отправителей входящих писем брокера (`charterer_contact@…`, `chartering@cargill.com` и т.п.), извлекать company-name из email-домена + signature, пред-заполнять `NewChartererModal` для подтверждения user'ом. Источник: реальные Gmail-треды брокера (доступ уже есть — auto-prequote/parser-email pipeline их и так читает).

**Why Gmail Import (а не CSV / Bloomberg / D&B):**

- Брокер и так общается с charterer'ами через Gmail → данные уже у него
- Парсер emails (`lib/parse-cargo/`, `lib/parse-recap/`) уже есть — можно переиспользовать domain-extraction
- Платные источники (D&B, Lloyd's List Intelligence, ICAP) — $500-5000/mo per seat, нет ROI на pre-revenue стадии

**Estimate:** 2-3 дня (1 — extractor `lib/charterers/gmail-extractor.ts`, 1 — UI flow «найдено 12 charterer'ов, подтвердить?», 1 — tests + QA loop).

**Trigger:** первый paying broker подключается → нужно реальное наполнение Charterer Credit для его сделок.

**Files:**

- `app/charterers/page.tsx:82-95` — кнопка «Import Gmail» (сейчас placeholder, добавить `onClick`).
- Новый: `lib/charterers/gmail-extractor.ts` — извлечь {domain, company-name, contact-emails} из входящих писем.
- Новый: `components/charterers/ImportGmailModal.tsx` — показать preview списка для подтверждения.
- `lib/market/charterers-repository.ts:upsertCharterer` — переиспользуем, не меняем.

**Out of scope (этой итерации):** payment_history population (через ручной ввод в `notes`/`payment_history` UI, отдельная фича когда брокер реально начнёт фиксировать платежи).
