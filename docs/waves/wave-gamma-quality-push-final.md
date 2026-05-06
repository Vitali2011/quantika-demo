# Wave γ Quality Push — Final Bake-off Report

**Run date:** 2026-05-06  
**Run ID:** 2026-05-06T20-04-16-452Z  
**Branch:** feat/wave-gamma-judge-retry  
**Spec:** Spec 03 (T3) — retry+backoff in judge.ts + final bake-off

---

## Summary

Финальный bake-off по трём endpoint'ам (parse-cargo, parse-vessel, parse-recap) был запущен с тремя моделями Gemini. Кандидатский вывод получен успешно для всех 213 пар (model × case × endpoint), однако судья (Bedrock Opus 4.7) недоступен в текущем AWS-аккаунте — все judge-вызовы вернули JUDGE_ERROR.

**Причина JUDGE_ERROR:** модель `us.anthropic.claude-opus-4-7-20260415-v1:0` не активирована в AWS-аккаунте (ValidationException: "The provided model identifier is invalid"). Требует активации cross-region inference profile через AWS Console → Bedrock → Model Access.

---

## Bake-off results table

| Endpoint     | Model                 | Cases   | Candidate OK | Parse Err | Model Err | Judge Status                        |
| ------------ | --------------------- | ------- | ------------ | --------- | --------- | ----------------------------------- |
| parse-cargo  | gemini-2.5-flash-lite | 24      | 24           | 0         | 0         | 100% JUDGE_ERROR                    |
| parse-cargo  | gemini-2.5-flash      | 24      | 24           | 0         | 0         | 100% JUDGE_ERROR                    |
| parse-cargo  | gemini-2.5-pro        | 24      | 15           | 1         | 8         | 63% JUDGE_ERROR, 37% model/no-judge |
| parse-recap  | gemini-2.5-flash-lite | 22      | 22           | 0         | 0         | 100% JUDGE_ERROR                    |
| parse-recap  | gemini-2.5-flash      | 22      | 21           | 1         | 0         | 95% JUDGE_ERROR                     |
| parse-recap  | gemini-2.5-pro        | 22      | 21           | 1         | 0         | 95% JUDGE_ERROR                     |
| parse-vessel | gemini-2.5-flash-lite | 25      | 25           | 0         | 0         | 100% JUDGE_ERROR                    |
| parse-vessel | gemini-2.5-flash      | 25      | 25           | 0         | 0         | 100% JUDGE_ERROR                    |
| parse-vessel | gemini-2.5-pro        | 25      | 25           | 0         | 0         | 100% JUDGE_ERROR                    |
| **TOTAL**    | —                     | **213** | **202**      | **3**     | **8**     | **Judge: unavailable**              |

---

## Latency & cost profile (candidate generation only)

| Model                 | N   | p50 latency | p95 latency | Total cost (run) | Cost/1k cases (est.) |
| --------------------- | --- | ----------- | ----------- | ---------------- | -------------------- |
| gemini-2.5-flash-lite | 71  | 2 235 ms    | 4 927 ms    | $0.062           | ~$0.87               |
| gemini-2.5-flash      | 71  | 13 888 ms   | 33 286 ms   | $0.290           | ~$4.08               |
| gemini-2.5-pro        | 71  | 27 408 ms   | 60 004 ms   | $1.049           | ~$14.77              |

Notes:

- gemini-2.5-pro имеет 33% model errors (timeout 60s) на parse-cargo — нестабилен на этом endpoint'е.
- gemini-2.5-flash-lite: лучшая скорость, самая низкая цена, 0 model/parse ошибок.
- gemini-2.5-flash: баланс между скоростью и качеством.

---

## Judge infrastructure status

| Component                         | Status                                             |
| --------------------------------- | -------------------------------------------------- | ------------------- | -------------------- |
| Retry helper `callWithRetry`      | Реализован. Задержки [1000, 5000, 30000, 60000] мс |
| Throttle detection (`isThrottle`) | Паттерн `/429                                      | ThrottlingException | Too Many Requests/i` |
| Unit tests (3 retry scenarios)    | 14/14 PASS                                         |
| Bedrock Opus 4.7 connectivity     | FAIL — model not activated in AWS account          |
| Judge verdict coverage            | 0% (все записи JUDGE_ERROR)                        |

---

## Retry implementation (spec T3)

Добавлено в `scripts/wave-gamma-bake-off/judge.ts`:

```typescript
export const RETRY_DELAYS_MS = [1000, 5000, 30000, 60000] as const;

export function isThrottle(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /429|ThrottlingException|Too Many Requests/i.test(msg);
}

export async function callWithRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = ...,
): Promise<T> { ... }
```

Behaviour:

- 429 / ThrottlingException / "Too Many Requests" → retry (до 4 попыток)
- 500 / auth / validation errors → throw немедленно (no retry)
- После 4 неудачных попыток → оригинальная ошибка

---

## Orchestrator: --max-concurrency

Добавлен CLI-флаг в `scripts/wave-gamma-bake-off/cli.ts`:

```bash
npx tsx scripts/wave-gamma-bake-off/cli.ts --max-concurrency=4
```

Дефолт изменён с 5 → 4 (per spec). Переопределяет `BAKE_OFF_CONCURRENCY` env.

---

## Recommendation

**DEFERRED** для всех трёх endpoint'ов.

Причина: judge-вердикт недоступен из-за отсутствия активации Bedrock Opus 4.7 в AWS-аккаунте. Кандидатный вывод Gemini работает корректно.

**Action items перед следующим прогоном:**

1. Активировать model access в AWS Console → Bedrock → Model Access → `us.anthropic.claude-opus-4-7-20260415-v1:0`
2. Или установить `JUDGE_BEDROCK_MODEL` на доступную модель (напр. `us.anthropic.claude-sonnet-4-6-20250514-v1:0`)
3. Повторить `npx tsx scripts/wave-gamma-bake-off/cli.ts --max-concurrency=4`

Когда judge заработает, рекомендуется **gemini-2.5-flash-lite** как кандидат для production (лучшая latency + нулевые ошибки), с **gemini-2.5-flash** как fallback для сложных endpoint'ов.

---

## Artifacts

- Records JSONL: `.specs/wave-gamma-vertex/bake-off-results/2026-05-06T20-04-16-452Z/records.jsonl` (213 records)
- Orchestrator report: `.specs/wave-gamma-vertex/bake-off-results/2026-05-06T20-04-16-452Z/report-2026-05-06T20-04-16-452Z.md`
- Test log: `.specs/logs/spec-wgqp-03.log`
