# Phase 1 — IMSBC Cargo Profiles Extraction (Hybrid: Web Search + Knowledge)

Тебе нужно создать **компактный JSON** с 18 cargo profiles для freight forwarder L5C compatibility matrix. Source: IMSBC Code (IMO 2024 edition в идеале) + broker practice.

**Важно:** PDF недоступен (IMO web shop требует оплаты). Используй **WebSearch/WebFetch + свои training data**:
- Открытые публикации: Marine Insight, BIMCO, Britannia P&I, Standard Club, North P&I, ClassNK, Wikipedia (IMSBC Code), Inchcape Shipping
- Свои знания о IMSBC Group A/B/C classification для major bulk cargoes (DRI Group A, coal Group B, iron-ore Group A, fertilizers по типу, etc.)

Цель — production-ready profiles для нижестоящего pair generation. Это НЕ pairs, только profiles.

## 18 cargo classes (фиксированный список, lowercase keys как ниже)

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

JSON-объект, top-level keys = названия классов (используй ровно эти ключи: `grain`, `steel`, `pipes`, `iron-ore`, `dri`, `coal`, `petcoke`, `fertilizer`, `cement`, `sulphur`, `scrap`, `bauxite`, `general`, `sugar`, `salt`, `limestone`, `manganese ore`, `copper concentrate`).

Для каждого класса:

```json
{
  "<class>": {
    "imsbc_group": "A" | "B" | "C" | null,
    "imsbc_section": "appendix-N-name | not-imsbc-classified",
    "chemistry": "1-2 строки про физико-химические свойства, релевантные contamination",
    "contamination_risk": ["food-grade reject", "iron oxide stain", "..."],
    "dust_profile": "high" | "medium" | "low",
    "moisture_sensitivity": "high" | "medium" | "low",
    "self_heating": true | false,
    "compatible_with": ["<class>", ...],
    "incompatible_with": ["<class>", ...],
    "extra_clean_required_after": true | false,
    "broker_notes": "1-2 строки broker rule of thumb (cleaning grade — 'hospital clean', 'grain clean')",
    "sources": ["URL or 'training-data'", "..."]
  }
}
```

Поле `sources` — добавлено для hybrid mode: для каждого профиля укажи 1-3 URL'а откуда взяты ключевые факты (или "training-data" если не нашёл web source). Это даёт reviewer (мне) traceability.

## Правила

1. **IMSBC group**: A (liquefaction), B (chemical hazard), C (other). Major cargoes:
   - Group A: iron ore fines, bauxite (некоторые), nickel ore, DRI fines
   - Group B: coal, DRI, sulphur, petcoke (некоторые), ferrous metal scrap, fertilizers
   - Group C: grain, cement, salt, limestone, manganese ore (обычно)
   - "general" → null + section = "not-imsbc-classified"
2. **chemistry**: коротко. «Carbon residue, oily, fine dust» лучше длинной философии.
3. **dust_profile**: high = petcoke, coal, iron-ore, cement, manganese ore, bauxite. low = steel, pipes, general.
4. **self_heating**: true для DRI (фундаментально через oxidation), некоторых coals (sub-bituminous), petcoke иногда. См. IMSBC schedules.
5. **compatible_with / incompatible_with**: твоё мнение на основе chemistry. Не exhaustive — Phase 2 уточнит.
6. **broker_notes**: типичные практики чартеринга. «Hospital clean required after» / «grain clean acceptable».

## Источники для приоритетного поиска

- Marine Insight — обзоры IMSBC schedules: https://www.marineinsight.com
- BIMCO bulker guides
- Britannia P&I "Carriage of bulk cargoes" series
- North P&I cargo handling notes
- Wikipedia: "IMSBC Code" (общая taxonomy)
- IMO Publications page (даже если PDF недоступен, schedule listings обычно есть)

Для каждого класса минимум 1 web search query. Web fetch на самые релевантные результаты.

## Self-check перед записью

- [ ] Ровно 18 keys на верхнем уровне
- [ ] Все 12 полей заполнены (никаких null кроме imsbc_group для general)
- [ ] imsbc_section conform к pattern `appendix-N-...` (или canonical name) или `not-imsbc-classified`
- [ ] compatible_with и incompatible_with — массивы строк из 18 классов (точные ключи)
- [ ] sources непустой для каждого class

## Output

Запиши JSON в `/Users/jarvis/work/qd-l5c-data/.private/l5c-data/cargo-profiles.json`.
Создай parent directory если её нет (`mkdir -p .private/l5c-data` уже выполнен).

После записи — выведи короткий summary: сколько классов, сколько с web sources vs training-data only, low-confidence flags если есть.
