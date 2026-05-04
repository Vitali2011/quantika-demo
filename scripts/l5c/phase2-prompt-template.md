# Phase 2 — L5C Pair Generation для previous cargo: {{PREVIOUS_CARGO}}

Тебе даны 18 cargo profiles (см. ниже) с IMSBC chemistry, dust/moisture, self-heating, broker rules. Это компактный summary 600-страничного IMSBC Code 2024.

## Задача

Для назначенного previous cargo `{{PREVIOUS_CARGO}}` сгенери **17 пар** — по одной на каждый из остальных 17 классов в качестве `next`.

## Output format

JSON массив. Записать в файл `.private/l5c-data/pairs-from-{{PREVIOUS_CARGO_SLUG}}.json` (slug = lowercase, spaces → hyphen, например `manganese-ore`, `copper-concentrate`).

```json
[
  {
    "previous": "{{PREVIOUS_CARGO}}",
    "next": "<other class>",
    "compatible": true,
    "extra_clean": false,
    "reason": "1 строка обоснование с конкретным механизмом"
  }
]
```

## Правила (КРИТИЧНО)

1. **Положительный контракт** (anti-recursive-bug): если `compatible: false` — `reason` ОБЯЗАТЕЛЕН и должен ссылаться на конкретный механизм (contamination type, self-heating, moisture, dust, IMSBC group). НЕ generic "incompatible cargo combination". Примеры хорошего reason:
   - "Iron oxide dust contamination, food-grade rejected (DRI Group A)"
   - "Carbon residue, oily — hospital clean required if next is food-grade"
   - "Self-heating Group A risk overlap — segregation required"

2. **Symmetric default**: если по chemistry компат симметричен (`A→B == B→A`), укажи это в reason. Asymmetric случаи обоснуй явно (например, `petcoke→steel` после грузового clean допустим, но `steel→petcoke` тоже ОК — оба симметричны).

3. **extra_clean: true** если хотя бы одно из:
   - previous high-dust (petcoke, coal, iron-ore, cement, manganese ore)
   - next contamination-sensitive (grain, sugar, fertilizer)
   - previous self-heating (DRI, some coals, sulphur)

4. **Conservative bias**: при сомнении → `compatible: false` + reason "manual surveyor review required". Fail-closed безопаснее fail-open. Это критично для freight forwarding.

5. **17 пар, не 18** — не включай `previous == next` (само-в-себя бессмысленно).

6. Используй точные имена классов из profiles (lowercase, с дефисами): `iron-ore`, `manganese ore`, `copper concentrate` и т.д.

## Self-check перед записью

- ровно 17 объектов в массиве
- все `previous` равны `{{PREVIOUS_CARGO}}`
- все 17 `next` уникальны и принадлежат списку 18 классов (минус самого себя)
- каждый `compatible:false` имеет non-empty `reason` с конкретным механизмом
- JSON валидный

## 18 cargo profiles (source of truth для решений)

```json
{{CARGO_PROFILES_JSON}}
```

Output → `.private/l5c-data/pairs-from-{{PREVIOUS_CARGO_SLUG}}.json` (абсолютный путь будет передан в prompt при запуске).
