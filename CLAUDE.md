# Claude Code — quantika-demo

## VPS Deploy Notes

- `NEXT_PUBLIC_*` переменные запекаются в бандл при `npm run build` (уже включён в deploy-vps.sh).
  Изменение `.env.local` без rebuild не обновит клиентские флаги.
- После изменения `.env.local` на VPS: `pm2 restart quantika-demo --update-env`
  (НЕ `pm2 reload` — он не перечитывает env).
- Новые страницы дают «client reference manifest does not exist» до полного `npm run build`.
