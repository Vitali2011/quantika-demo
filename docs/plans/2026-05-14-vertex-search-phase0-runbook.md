# Phase 0 Runbook — Провижининг Vertex AI Search

**Дата:** 2026-05-14
**Ветка:** feat/knowledge-vertex-search
**Скилл:** devops-deploy (Iron Law: dry-run + rollback до выполнения)
**Цель:** создать GCP-инфраструктуру, на которую опирается `retriever-vertex.ts`.

---

## 0. КОНТРАКТ — что код ожидает точь-в-точь

`lib/knowledge/embeddings/retriever-vertex.ts` строит путь:

```
projects/{projectId}/locations/{location}/collections/default_collection/dataStores/{datastoreId}/servingConfigs/default_config
```

| Элемент пути         | Откуда код берёт                                              | Жёстко зашито? | Значение, которое надо обеспечить                                    |
| -------------------- | ------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| `projectId`          | env `VERTEX_SEARCH_PROJECT` → fallback `GOOGLE_CLOUD_PROJECT` | нет            | `quantika-vertex-search`                                             |
| `location`           | env `VERTEX_SEARCH_LOCATION` → дефолт `global`                | нет            | `global`                                                             |
| `default_collection` | строка в коде                                                 | **ДА**         | дефолтная коллекция GCP — создаётся сама                             |
| `{datastoreId}`      | env `VERTEX_DATASTORE_IMSBC` / `_IGC` / `_JWC` / `_BIMCO`     | нет            | см. рекомендованные ID ниже                                          |
| `default_config`     | строка в коде                                                 | **ДА**         | serving config с этим именем ОБЯЗАН существовать у каждого datastore |

**Два жёстко зашитых значения — точки риска:** `default_collection` и `default_config`.
`default_collection` — это дефолт GCP, существует всегда. `default_config` — **надо проверить
после создания первого datastore** (Фаза 4.5 ниже). Если GCP создаст serving config с другим
именем — либо переименовать, либо поправить ОДНУ строку 85 в `retriever-vertex.ts`.

---

## 1. Рекомендованные конкретные ID

| Ресурс          | ID                       | env-переменная                                 |
| --------------- | ------------------------ | ---------------------------------------------- |
| GCP-проект      | `quantika-vertex-search` | `VERTEX_SEARCH_PROJECT=quantika-vertex-search` |
| Location        | `global`                 | `VERTEX_SEARCH_LOCATION=global`                |
| Datastore IMSBC | `quantika-imsbc`         | `VERTEX_DATASTORE_IMSBC=quantika-imsbc`        |
| Datastore IGC   | `quantika-igc`           | `VERTEX_DATASTORE_IGC=quantika-igc`            |
| Datastore JWC   | `quantika-jwc`           | `VERTEX_DATASTORE_JWC=quantika-jwc`            |
| Datastore BIMCO | `quantika-bimco`         | `VERTEX_DATASTORE_BIMCO=quantika-bimco`        |

Datastore ID: 1-63 символа, строчные буквы/цифры/дефис, начинается с буквы — все выбранные подходят.

---

## 2. Phase 1 — Reconnaissance (установленные факты)

- Кредит «Trial credit for GenAI App Builder» zł3,713.35, 100% не тронут, до 15.04.2027,
  на billing-аккаунте `016AA1-656306-DC8CBC`.
- Кредит привязан к billing-аккаунту, не к проекту → покрывает ЛЮБОЙ проект, привязанный
  к этому billing-аккаунту (для eligible SKU = Vertex AI Search).
- `gcloud` локально авторизован как `vitali6825621@gmail.com`, видит этот billing-аккаунт.
- Проект `quantika-vertex-search` ещё не создан — чистый старт.
- Приложение работает на проекте `quantika-demo-496307` (другой billing). Поэтому Search
  выносим в ОТДЕЛЬНЫЙ проект `quantika-vertex-search` на billing с кредитом — код уже умеет
  это через `VERTEX_SEARCH_PROJECT` (коммит 4a70317).

## 3. Phase 2 — Rollback Plan

Всё в Фазе 0 обратимо:

```
# Удалить datastore:
gcloud alpha discovery-engine data-stores delete DATASTORE_ID \
  --location=global --project=quantika-vertex-search

# Отвязать billing / удалить проект целиком (откатывает ВСЁ):
gcloud projects delete quantika-vertex-search
```

Удаление проекта в GCP — soft-delete, 30 дней на восстановление. Риск потери данных = 0
(исходные документы остаются в SQLite на VPS — это источник правды).

## 4. Phase 3 — Dry-run / проверка предпосылок

ДО создания чего-либо выполнить и убедиться:

```
# 4.1 — кто я и есть ли доступ
gcloud auth list
gcloud billing accounts describe 016AA1-656306-DC8CBC      # должен вернуть open: true

# 4.2 — проект ещё не занят
gcloud projects describe quantika-vertex-search            # ожидаем NOT_FOUND

# 4.3 — квота на проекты не исчерпана (обычно лимит ~12-25 на аккаунт)
gcloud projects list --format="value(projectId)" | wc -l
```

## 5. Phase 4 — Execute (по одному шагу, проверка после каждого)

```
# --- 5.1 Создать проект ---
gcloud projects create quantika-vertex-search --name="Quantika Vertex Search"
gcloud projects describe quantika-vertex-search --format="value(lifecycleState)"
# ждём ACTIVE

# --- 5.2 Привязать к billing-аккаунту с кредитом ---
gcloud billing projects link quantika-vertex-search \
  --billing-account=016AA1-656306-DC8CBC
gcloud billing projects describe quantika-vertex-search
# проверить: billingEnabled: true, billingAccountName .../016AA1-656306-DC8CBC

# --- 5.3 Включить API ---
gcloud services enable discoveryengine.googleapis.com \
  --project=quantika-vertex-search
gcloud services list --enabled --project=quantika-vertex-search | grep discoveryengine
# подождать ~1-2 мин пока API активируется

# --- 5.4 Создать ПЕРВЫЙ datastore (imsbc) и ОСТАНОВИТЬСЯ на проверке 5.5 ---
gcloud alpha discovery-engine data-stores create quantika-imsbc \
  --location=global \
  --project=quantika-vertex-search \
  --display-name="IMSBC Code" \
  --industry-vertical=GENERIC \
  --content-config=CONTENT_REQUIRED \
  --solution-types=SOLUTION_TYPE_SEARCH
```

### 5.5 — КРИТИЧЕСКАЯ ПРОВЕРКА serving config (devops Phase 3 spirit)

После создания ТОЛЬКО ПЕРВОГО datastore — проверить, какой serving config создался:

```
gcloud alpha discovery-engine serving-configs list \
  --data-store=quantika-imsbc \
  --location=global \
  --project=quantika-vertex-search
```

- Если в списке есть `default_config` → контракт совпадает, продолжать с 5.6
- Если ID другой (напр. `default_search`) → СТОП. Два варианта:
  - (A) создать serving config с именем `default_config` вручную, ИЛИ
  - (B) поправить строку 85 в `lib/knowledge/embeddings/retriever-vertex.ts`
    (`servingConfigs/default_config` → фактический ID) — 1 строка, потом пересобрать.
    Выбор — сообщить оператору сессии.

### 5.6 — Создать остальные 3 datastore (только после успешной 5.5)

```
for PAIR in "quantika-igc:IGC Code" "quantika-jwc:JWC War-Risk Bulletins" "quantika-bimco:BIMCO Fixture Clauses"; do
  ID="${PAIR%%:*}"; NAME="${PAIR##*:}"
  gcloud alpha discovery-engine data-stores create "$ID" \
    --location=global --project=quantika-vertex-search \
    --display-name="$NAME" --industry-vertical=GENERIC \
    --content-config=CONTENT_REQUIRED --solution-types=SOLUTION_TYPE_SEARCH
done
```

## 6. Phase 5 — Verify + установить env-переменные

```
# 6.1 — все 4 datastore существуют
gcloud alpha discovery-engine data-stores list \
  --location=global --project=quantika-vertex-search

# 6.2 — дописать env-переменные в worktree (.env.local)
#       строки добавить вручную в /root/quantika-demo-kvertex/.env.local :
#         VERTEX_SEARCH_PROJECT=quantika-vertex-search
#         VERTEX_SEARCH_LOCATION=global
#         VERTEX_DATASTORE_IMSBC=quantika-imsbc
#         VERTEX_DATASTORE_IGC=quantika-igc
#         VERTEX_DATASTORE_JWC=quantika-jwc
#         VERTEX_DATASTORE_BIMCO=quantika-bimco
#       на Фазе 4 — те же строки в прод /root/quantika-demo/.env.local
```

ADC: `retriever-vertex.ts` использует `SearchServiceClient()` без явных credentials —
он берёт `GOOGLE_APPLICATION_CREDENTIALS` (`/root/.config/gcp/quantika-vertex-ai.json`).
Этот service account должен иметь роль `discoveryengine.viewer` (или `editor`) в проекте
`quantika-vertex-search`:

```
SA=$(gcloud iam service-accounts list --project=quantika-demo-496307 --format="value(email)" | head -1)
gcloud projects add-iam-policy-binding quantika-vertex-search \
  --member="serviceAccount:$SA" --role="roles/discoveryengine.viewer"
```

## 7. Следующий шаг (НЕ входит в этот runbook) — загрузка документов

Datastore'ы созданы, но ПУСТЫЕ. Нужно загрузить контент справочников с метадатой
`structData` (поля source/section/id/bulletinId — обязательны для citation-валидатора).
Практичный путь: экспортировать существующие чанки из SQLite-таблиц со суффиксом `_vec`
в JSONL с structData → импорт в datastore. Для этого нужен отдельный скрипт-конвертер —
готовится отдельно.

## 8. После Фазы 0 → Фаза 4 (выкатка)

Когда datastore'ы созданы, заполнены и serving config подтверждён — переходим к Фазе 4
основного плана: env-vars на прод, `KNOWLEDGE_BACKEND=sqlite` → проверка → `vertex` → соак.
