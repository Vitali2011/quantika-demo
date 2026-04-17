# Hotfix Prompts — Quantika Demo + VPS

Три независимых промпта. Каждый — самодостаточный, можно запускать отдельно.

---

## ПРОМПТ 1 — VPS: остановить crash-loop + защита от brute-force

```
Ты DevOps-агент. Выполни задачи на VPS через SSH.

Подключение:
  sshpass -p 'Vit15932' ssh -o StrictHostKeyChecking=no root@185.249.225.169 'КОМАНДА'

---

ЗАДАЧА 1.1 — Остановить crash-loop сервиса ai-ops-backend

Проблема:
  Сервис /etc/systemd/system/ai-ops-backend.service падает с ошибкой
  "Error: Cannot find module 'cors'" каждые 5 секунд.
  657 падений за последний час. Заглушает логи journalctl.

Диагностика (выполни сначала):
  systemctl status ai-ops-backend.service --no-pager -l
  ls /root/.openclaw/workspace-dev-coach/projects/ai-ops-platform/backend/node_modules/cors 2>/dev/null || echo "cors not installed"

Фикс A — если модуль просто не установлен:
  cd /root/.openclaw/workspace-dev-coach/projects/ai-ops-platform/backend
  npm install cors
  systemctl restart ai-ops-backend.service
  sleep 5
  systemctl is-active ai-ops-backend.service

Фикс B — если директория dist/ отсутствует или проект заброшен:
  systemctl stop ai-ops-backend.service
  systemctl disable ai-ops-backend.service
  echo "Сервис отключён — проект требует полного rebuild"

Проверка после фикса:
  journalctl -u ai-ops-backend --since "1 minute ago" --no-pager | tail -5
  # Должно быть либо "active (running)" либо сервис не появляется в логах вообще

---

ЗАДАЧА 1.2 — Защита SSH от brute-force

Проблема:
  7694 попытки входа за 24 часа с 786 уникальных IP.
  Нет fail2ban, нет блокировки по количеству попыток.
  Root-логин с паролем открыт для всего мира.

Шаги:

1. Установить и настроить fail2ban:
  apt-get update -qq && apt-get install -y fail2ban

2. Создать конфиг для SSH:
  cat > /etc/fail2ban/jail.d/ssh-hardened.conf << 'EOF'
  [sshd]
  enabled = true
  port = ssh
  filter = sshd
  logpath = /var/log/auth.log
  maxretry = 5
  findtime = 300
  bantime = 3600
  ignoreip = 127.0.0.1/8
  EOF

3. Запустить:
  systemctl enable fail2ban
  systemctl restart fail2ban
  sleep 3
  fail2ban-client status sshd

4. Проверка — должно показать banned IPs:
  fail2ban-client status sshd | grep "Banned IP"

Итоговая проверка обеих задач:
  echo "=== ai-ops-backend ===" && systemctl is-active ai-ops-backend.service
  echo "=== fail2ban ===" && systemctl is-active fail2ban
  echo "=== banned IPs ===" && fail2ban-client status sshd 2>/dev/null | grep "Banned IP"
```

---

## ПРОМПТ 2 — Код: исправить `lastCargoes [object Object]` + `geared=True` для Gearless судов

```
Ты Senior TypeScript разработчик. Исправь два бага в Next.js приложении.
Репозиторий: ~/work/quantika-demo/
Не делай коммит. Только исправь файлы.

---

БАГ 1 — lastCargoes сохраняется в БД как "[object Object], [object Object]..."

Файл: app/api/ai/parse-vessel/route.ts
Строки 124-134:

  lastCargoes: (() => {
    let lc = item.last_cargoes;
    if (!lc) return null;
    if (typeof lc === 'object' && 'value' in lc) lc = lc.value;
    if (Array.isArray(lc)) return lc.map(String).join(', ');  // ← БАГ ЗДЕСЬ
    if (typeof lc === 'string') {
      try { const parsed = JSON.parse(lc); if (Array.isArray(parsed)) return parsed.join(', '); } catch {}
      return lc;
    }
    return String(lc);
  })(),

Причина: LLM иногда возвращает last_cargoes как массив ConfidenceField-объектов
вида [{value: "grain", confidence: "confirmed", sourceText: "..."}, ...].
.map(String) вызывает toString() → "[object Object]".

Исправление — замени строку с map(String) на:
  if (Array.isArray(lc)) {
    return lc
      .map((item: unknown) =>
        item !== null && typeof item === 'object' && 'value' in (item as object)
          ? String((item as { value: unknown }).value)
          : String(item)
      )
      .filter(Boolean)
      .join(', ');
  }

---

БАГ 2 — geared=True для судна "Gearless (shore cranes required)"

Файл: app/api/ai/parse-vessel/route.ts
Строка 116:
  geared: item.geared != null ? Boolean(item.geared) : null,

Проблема: LLM читает "shore cranes required" и интерпретирует как geared=true.
Слово "cranes" в контексте "shore cranes" означает что кранов НА БОРТУ нет.

Исправление — добавь post-processing после строки 116:

  // Строка 116 — оставь как есть:
  geared: item.geared != null ? Boolean(item.geared) : null,

  // Добавь override-логику ПОСЛЕ строки 141 (после закрытия объекта ParsedVessel),
  // прямо перед } as ParsedVessel):

На самом деле сделай это через геттер при маппинге — замени строку 116 целиком:

  geared: (() => {
    // Если LLM вернул false — доверяем
    if (item.geared === false) return false;
    // Если specialFeatures содержит "Gearless" — переопределяем
    const feats: string = JSON.stringify(item.special_features || '').toLowerCase();
    if (feats.includes('gearless')) return false;
    // Если в теле письма есть "gearless" и нет "crane capacity" — переопределяем
    const bodyLower = userPrompt.toLowerCase();
    if (bodyLower.includes('gearless') && !bodyLower.match(/\d+\s*[xх]\s*\d+\s*t/i)) return false;
    // Иначе — доверяем LLM
    return item.geared != null ? Boolean(item.geared) : null;
  })(),

---

ТАКЖЕ — исправь prompt в lib/prompts.ts

Строка 279:
  - geared: boolean (true if vessel has cranes/derricks)

Замени на:
  - geared: boolean — true ONLY if the vessel itself has on-board cranes or derricks. Set false if the email says "Gearless", "GLESS", or "shore cranes required" (shore cranes belong to the port, not the vessel). When in doubt and email contains "gearless" keyword, set false.

---

Проверь что не сломал TypeScript:
  cd ~/work/quantika-demo && npx tsc --noEmit 2>&1 | head -20

Если ошибок нет — готово.
```

---

## ПРОМПТ 3 — Код: исправить refYear захардкоженный как 2025

```
Ты Senior TypeScript разработчик. Один точечный фикс.
Репозиторий: ~/work/quantika-demo/
Не делай коммит. Только исправь файл.

---

БАГ — refYear захардкожен как 2025 в match route

Файл: app/api/ai/match/route.ts

Найди строку вида:
  session.createdAt.getUTCFullYear() === new Date().getUTCFullYear() ? 2025 : session.createdAt.getUTCFullYear()

Или найди через:
  grep -n "refYear\|2025" ~/work/quantika-demo/app/api/ai/match/route.ts

Проблема:
  Если сессия создана в 2026, refYear=2025.
  В lib/sailing/readiness-gap.ts даты типа "end Aug / early Sep" парсятся с refYear.
  Результат: arrivalDate вычисляется в 2025, а laycanStart в 2026 → gapDays=~365.
  Все суда получают verdict="idle" и могут неправильно фильтроваться.

Исправление:
  Замени логику refYear на:

  // Всегда используем реальный текущий год для парсинга дат из email
  // Исключение: если сессия создана в прошлом году — используем год сессии
  const sessionYear = session.createdAt.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const refYear = sessionYear < currentYear ? sessionYear : currentYear;

Смысл: вместо хардкода 2025 — динамически берём текущий год.
Когда наступит 2027, код не сломается.

Проверь TypeScript:
  cd ~/work/quantika-demo && npx tsc --noEmit 2>&1 | head -10
```

---

## Порядок применения

1. **Промпт 1** — выполняется на VPS (независимо от кода)
2. **Промпт 2** — правки в коде (самый важный — два видимых бага)
3. **Промпт 3** — правка в коде (быстрая, 3 строки)

После применения промптов 2+3 — перезапустить Next.js:
```bash
sshpass -p 'Vit15932' ssh root@185.249.225.169 'systemctl restart quantika-demo 2>/dev/null || pm2 restart quantika-demo 2>/dev/null || echo "перезапусти next-server вручную"'
```
