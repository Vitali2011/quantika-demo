# Claude Code — quantika-demo

## Общий язык домена (читай ПЕРЕД задачей)

- Перед задачей читай [`CONTEXT.md`](CONTEXT.md) — канонический глоссарий домена
  фрахта (TCE, voyage P&L, RAG scope, bunker/discharge port, demotion reason,
  match bucket, demo-mode и т.д.).
- Имена переменных, тестов и функций = **каноничные термины оттуда**
  (`tce`, не `timeCharterEq`; `discharge_port`, не `destinationPort`).
  Новый доменный термин → допиши в `CONTEXT.md` в том же PR.
- Новое архитектурное решение (новый провайдер, БД, движок, что трудно
  откатить) → заведи ADR в [`docs/adr/`](docs/adr/) по шаблону из
  [`docs/adr/README.md`](docs/adr/README.md).

## VPS Deploy Notes

- Прод (outreach-vps 185.249.225.169) — **systemd unit `quantika-demo`**
  (`systemctl restart/status quantika-demo`, `journalctl -u quantika-demo`).
  pm2 на проде НЕТ; legacy `scripts/deploy-vps.sh` (pm2) — не прод-путь.
- Деплой: GH workflow `deploy.yml` → `/root/deploy-quantika-demo.sh` —
  self-updating копия канонического `ops/scripts/deploy-quantika-demo.sh`
  (staged build в `/root/quantika-demo-build` + атомный swap; см. #940).
  Менять только через PR — ручные правки на VPS затираются self-update'ом.
- `NEXT_PUBLIC_*` переменные запекаются в бандл при `npm run build`.
  Изменение `.env.local` без rebuild не обновит клиентские флаги.
- После изменения `.env.local` на проде: `systemctl restart quantika-demo`
  (EnvironmentFile перечитывается на старте сервиса).
- Новые страницы дают «client reference manifest does not exist» до полного `npm run build`.

## Доступные скиллы (quantika-specific)

- `/next-best-practices` — ambient скилл для Next.js: RSC boundaries, async patterns, route handlers,
  image/font optimization, hydration errors, bundling. Применяется при любой работе с app/ или pages/.
- `/next-cache-components` — точечно при работе с PPR (Partial Pre-rendering), `'use cache'`,
  ISR или Server Component кешированием.
- `/taste-skill` — minimalist editorial preset. **Использовать ТОЛЬКО для marketing / landing страниц** (/about, /pricing). Для data-dense pages (matches, compare-routes, dashboard) использовать `/frontend-design`. Подробнее: SKILL.md «Scope Override».

## Свежие доки вместо памяти модели (анти-«устаревший API»)

Проект на **Next.js 16 + React 19** — новее катоффа знаний модели. Память модели
про Next.js 14/15 здесь не источник истины.

Перед написанием кода, который трогает нестабильные/новые API — **сверься со свежей
документацией через WebFetch** (не пиши по памяти):

- App Router, route handlers, server actions, middleware → `https://nextjs.org/docs/app`
- `'use cache'`, PPR, ISR, кеширование → `https://nextjs.org/docs/app/building-your-application/caching`
- React 19 (use, Actions, ref-as-prop) → `https://react.dev/reference/react`
- shadcn/ui компоненты → `https://ui.shadcn.com/docs/components/<component>`

Правило срабатывания: если API появился/менялся в Next 15+ или React 19, или есть
малейшее сомнение в сигнатуре — сначала WebFetch нужной страницы доков, потом код.
Для стабильных API (fs, fetch, обычный JSX) — не нужно, не трать контекст.

Субагентам в планах (writing-plans / subagent-driven-development) включать строку:
«Before using Next.js/React APIs introduced or changed after v14 — WebFetch the
relevant nextjs.org/react.dev docs page first».

## RTK — токен-компрессия вывода команд (trial)

<!-- rtk-instructions v2 (condensed) -->

Установлен `rtk` (Rust Token Killer): префиксуй им шумные команды — он сжимает
вывод на 60–90% до попадания в контекст. Без фильтра — прозрачный passthrough,
всегда безопасен. В цепочках `&&` префиксуй каждую команду.

Где обязательно (самый шумный вывод):

```bash
rtk jest / rtk vitest      # только failures (-99%)
rtk next build             # route metrics (-87%)
rtk tsc / rtk lint         # ошибки, сгруппированы по файлам (-83%)
rtk git diff / show        # компактный diff (-80%)
rtk git status / log / add / commit / push
rtk gh pr view / checks / run list (-80%)
rtk npm run <script> / rtk npx <cmd>
rtk curl <url>             # компактный HTTP (-70%)
```

Где НЕ нужно: команды с коротким выводом и когда нужен точный сырой вывод
(парсинг SHA, json для скриптов — или используй `rtk proxy <cmd>`).
⚠️ Финальная диагностика warnings/ошибок для отчёта — СЫРОЙ вывод (`rtk proxy`
или без rtk): компрессия скрывает file:line детали (A/B 2026-06-11: rtk-агент
отрапортовал «проблем нет» там, где без rtk нашлось 5 реальных stale-директив).
Статистика экономии: `rtk gain`.

<!-- /rtk-instructions -->

## Path-scoped rules

Перед редактированием модулей с историей регрессий — прочитать соответствующий файл:

- `lib/ai-provider.ts` → `.claude/rules/ai-provider.md`
- `lib/knowledge/embeddings/retriever*` → `.claude/rules/retriever.md`
- `app/api/admin/**` + `middleware.ts` → `.claude/rules/admin-api.md`
