# Phase 1 — IMSBC Cargo Profiles Extraction

Тебе дан **IMSBC Code 2024 PDF** (~600 страниц IMO regulatory document). Твоя задача — для каждого из 18 cargo classes ниже извлечь компактный профиль (~600 токенов на класс) с фактами из IMSBC, релевантными для compatibility decisions (можно ли везти X сразу после Y).

**Важно:** ты НЕ генеришь pairs здесь. Только profiles. Pairs делает Phase 2 на основе твоих profiles.

## 18 cargo classes (фиксированный список)

1. **grain** — пшеница, кукуруза, ячмень, соя, рис, овёс, сорго, рожь
2. **steel** — coils, plates, sections, billets, rebar, slabs, wire rod (HR/CR)
3. **pipes** — project, line, casing, tubing, drill pipes
4. **iron-ore** — fines, lumps, pellets, pellet feed
5. **dri** — Direct Reduced Iron, HBI, sponge iron
6. **coal** — coking, thermal, steam, met
7. **petcoke** — petroleum coke (любые формы)
8. **fertilizer** — urea, ammonium nitrate, DAP, MAP, potash, MOP, SOP
9. **cement** — cement + clinker
10. **sulphur** — sulphur (sulfur)
11. **scrap** — HMS, shredded, busheling, ferrous scrap
12. **bauxite** — bauxite + alumina
13. **general** — mixed/misc cargo (broker term, не IMSBC)
14. **sugar** — raw sugar, refined sugar
15. **salt** — sea salt, rock salt
16. **limestone** — limestone, dolomite
17. **manganese ore** — manganese ore
18. **copper concentrate** — copper concentrate (sulphide)

## Output format

Один JSON-объект, верхний уровень — keys = названия классов выше (lowercase, с дефисами как в списке). Записать в файл `.private/l5c-data/cargo-profiles.json`.

Для каждого класса:

```json
{
  "<class>": {
    "imsbc_group": "A|B|C|null",
    "imsbc_section": "appendix-N-name или 'not-imsbc-classified'",
    "chemistry": "1-2 строки про физико-химические свойства, релевантные contamination",
    "contamination_risk": ["food-grade reject", "iron oxide stain", ...],
    "dust_profile": "high|medium|low",
    "moisture_sensitivity": "high|medium|low",
    "self_heating": true|false,
    "compatible_with": ["<class>", ...],
    "incompatible_with": ["<class>", ...],
    "extra_clean_required_after": true|false,
    "broker_notes": "1-2 строки broker rule of thumb (ссылки на cleaning grade — 'hospital clean', 'grain clean')"
  }
}
```

## Правила

1. **IMSBC group**: A (liquefaction), B (chemical hazard), C (other) — из IMSBC schedules. Если "general" — ставь null + section = "not-imsbc-classified".
2. **chemistry**: коротко. «Carbon residue, oily, fine dust» лучше чем длинная философия.
3. **dust_profile**: high = petcoke, coal, iron-ore, cement, manganese ore. low = steel, pipes, general.
4. **self_heating**: true для DRI (фундаментально), некоторых coals, sulphur (limited). См. IMSBC schedule per cargo.
5. **compatible_with / incompatible_with**: твоё мнение на основе chemistry, НЕ exhaustive — Phase 2 уточнит.
6. **broker_notes**: типичные практики чартеринга. «Hospital clean required after» / «grain clean acceptable».

## Self-check перед записью

- 18 keys на верхнем уровне (ровно)
- Все 11 полей заполнены (никаких null кроме imsbc_group для general)
- imsbc_section conform к pattern `appendix-N-...` или `not-imsbc-classified`
- compatible_with и incompatible_with — массивы строк из 18 классов

Output → `.private/l5c-data/cargo-profiles.json` (абсолютный путь будет передан вместе с PDF).
