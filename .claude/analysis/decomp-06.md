item: 06
title: 5 уязвимостей в зависимостях (4 HIGH)
files:
  - package.json
  - package-lock.json
est_lines: 50
complexity: small
notes:
  - Уязвимости выявлены через npm audit (4 HIGH + 1 MODERATE)
  - Исправление — обновление версий пакетов в package.json (npm audit fix или ручной апгрейд)
  - package-lock.json регенерируется автоматически после npm install
  - Возможны breaking changes при major-версии апгрейда транзитивных зависимостей
  - После обновления необходима проверка совместимости с Next.js 14 и текущими peer deps
