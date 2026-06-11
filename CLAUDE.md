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

## Path-scoped rules

Перед редактированием модулей с историей регрессий — прочитать соответствующий файл:

- `lib/ai-provider.ts` → `.claude/rules/ai-provider.md`
- `lib/knowledge/embeddings/retriever*` → `.claude/rules/retriever.md`
- `app/api/admin/**` + `middleware.ts` → `.claude/rules/admin-api.md`
