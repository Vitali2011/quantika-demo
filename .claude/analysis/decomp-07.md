item: 07
title: "`lib/session.ts` — create/get/update/expire (5+ тестов)"
files:
  - lib/session.ts
  - lib/__tests__/session.test.ts
  - app/api/session/route.ts
est_lines: 160
complexity: medium
notes:
  - lib/session.ts использует глобальный Map и setTimeout для expire — нужно изолировать таймеры в тестах (jest.useFakeTimers)
  - deleteSession вызывается через dangling setTimeout — тест должен проверять что сессия исчезает после expiry
  - app/api/session/route.ts — внешний контракт изменять не нужно только убедиться что тесты покрывают те же операции
  - session.test.ts создаётся с нуля (аналогично currency.test.ts по структуре)
  - Jest уже настроен минимально конфиг может потребовать проверки moduleNameMapper для path aliases
