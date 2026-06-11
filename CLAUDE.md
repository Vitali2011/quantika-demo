# Claude Code — quantika-demo

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

## Path-scoped rules

Перед редактированием модулей с историей регрессий — прочитать соответствующий файл:

- `lib/ai-provider.ts` → `.claude/rules/ai-provider.md`
- `lib/knowledge/embeddings/retriever*` → `.claude/rules/retriever.md`
- `app/api/admin/**` + `middleware.ts` → `.claude/rules/admin-api.md`
