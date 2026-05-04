# Phase 4 — Cross-validate L5C pairs (Haiku 4.5)

Тебе даны:
- `cargo-profiles.json` — 18 cargo profiles из IMSBC (Phase 1 output)
- `draft-merged.json` — финальный draft пар после Phase 2 + symmetry merge

## Задача

Для каждой пары из draft независимо реши: agree или disagree с verdict (`compatible`, `extra_clean`, `reason`)? Если disagree — дай свой alt_verdict.

Это **independent second opinion**: твоя задача НЕ rubber-stamp, а ловить ошибки. Где Sonnet был слишком оптимистичен / пессимистичен — флагай.

## Output format

JSON массив. Записать в `.private/l5c-data/haiku-verdicts.json`.

```json
[
  {
    "pair": {
      "previous": "...",
      "next": "...",
      "compatible": true,
      "extra_clean": false,
      "reason": "..."
    },
    "agree": true,
    "alt_verdict": null,
    "confidence": "high"
  },
  {
    "pair": { ...другая пара... },
    "agree": false,
    "alt_verdict": {
      "compatible": false,
      "extra_clean": true,
      "reason": "Iron oxide dust contamination — Sonnet missed dust profile"
    },
    "confidence": "high"
  }
]
```

## Правила

1. Если `agree: true` → `alt_verdict: null`.
2. Если `agree: false` → `alt_verdict` обязателен с full тремя полями (compatible, extra_clean, reason).
3. **confidence**: `high` — IMSBC explicit, `medium` — broker practice, `low` — judgment call.
4. Особое внимание к:
   - **Fail-OPEN bugs**: `compatible:true` для пар где IMSBC говорит fail-closed (DRI→food, scrap→food, petcoke→food).
   - **Missing extra_clean**: high-dust previous + clean next без `extra_clean:true`.
   - **Symmetry**: если есть в draft и X→Y и Y→X, должны быть consistent.

## Output

Один JSON массив, длиной = `draft.pairs.length`. Все пары проверь, не пропускай.
