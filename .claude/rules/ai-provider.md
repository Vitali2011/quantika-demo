# Rules: lib/ai-provider.ts

## Invariants

- Провайдер выбирается по цепочке: `<SCOPE>_PROVIDER` → `AI_PROVIDER` → `"openai"`. Не хардкодить провайдера в коде — только через env.
- Все LLM-вызовы обязаны передавать `signal?: AbortSignal` из `AiOpts` и уважать `timeoutMs` (дефолт 85 000 мс). Без таймаута endpoint зависнет навсегда.
- `callAiJson` для Gemini: если передан `responseSchema` — парсить ответ напрямую (`r.text.trim()`). Если нет — сначала `extractJson()`. Нельзя пропускать `extractJson` для Bedrock: Sonnet 4.6 стабильно добавляет CoT-преамбулу.
- `claude-cli` провайдер запрещён в Next.js request handlers (`NEXT_RUNTIME` guard). Только в eval-скриптах.
- Каждый вызов пишет запись в `ai_audit` через `writeAuditRecord`. Ошибка записи не должна ронять основной вызов (try/catch внутри).
- OpenAI vision и OpenAI audio не реализованы — кидают `Error` с явным сообщением. Замена: Gemini.

## Anti-patterns (история регрессий)

- **Gemini structured-output mismatch**: если `responseSchema` не передан, а промпт ожидает JSON → модель оборачивает ответ в ``\`\`\`json```→`JSON.parse`падает. Решение: всегда передавать`responseSchema`при`callAiJson` для Gemini. (ref: memory project_quantika_demo_wave_gamma_complete_2026_05_05.md, ai_audit 2026-05-13)
- **CoT-preamble у Bedrock Sonnet 4.6**: 9/10 MATCH-failures в 24ч с `"Unexpected token 'I'"` — не убирать `extractJson()` из Bedrock-ветки. (ref: комментарий в extractJson, ai_audit)
- **Добавление нового провайдера без guard**: если провайдер неизвестен → `getProvider` возвращает `"openai"`, не падает. Это намеренно (fallback), но тихо.

## Checklist перед commit'ом

- [ ] Новый LLM-вызов получает `signal` из `opts` и пробрасывает таймаут
- [ ] Для Gemini JSON-ответа: передан `responseSchema` или явно вызван `extractJson`
- [ ] `claude-cli` вызовы — только вне `NEXT_RUNTIME`
- [ ] `writeAuditRecord` вызывается в `finally` блоке
