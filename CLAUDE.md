# Claude Code — quantika-demo

## VPS Deploy Notes

- `NEXT_PUBLIC_*` переменные запекаются в бандл при `npm run build` (уже включён в deploy-vps.sh).
  Изменение `.env.local` без rebuild не обновит клиентские флаги.
- После изменения `.env.local` на VPS: `pm2 restart quantika-demo --update-env`
  (НЕ `pm2 reload` — он не перечитывает env).
- Новые страницы дают «client reference manifest does not exist» до полного `npm run build`.

## Доступные скиллы (quantika-specific)

- `/next-best-practices` — ambient скилл для Next.js: RSC boundaries, async patterns, route handlers,
  image/font optimization, hydration errors, bundling. Применяется при любой работе с app/ или pages/.
- `/next-cache-components` — точечно при работе с PPR (Partial Pre-rendering), `'use cache'`,
  ISR или Server Component кешированием.
- `/taste-skill` — minimalist editorial preset. **Использовать ТОЛЬКО для marketing / landing страниц** (/about, /pricing). Для data-dense pages (matches, compare-routes, dashboard) использовать `/frontend-design`. Подробнее: SKILL.md «Scope Override».

## Path-scoped rules

Перед редактированием модулей с историей регрессий — прочитать соответствующий файл:

- `lib/ai-provider.ts` → `.claude/rules/ai-provider.md`
- `lib/knowledge/embeddings/retriever*` → `.claude/rules/retriever.md`
- `app/api/admin/**` + `middleware.ts` → `.claude/rules/admin-api.md`
