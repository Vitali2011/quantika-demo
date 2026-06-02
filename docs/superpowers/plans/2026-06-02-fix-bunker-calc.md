# FIX bunker-calculator — найдено на проде founder'ом 2026-06-02 (после компакта → dispatch)

> **POST-COMPACT ACTION:** запустить фикс-сессию по этой спеке. Founder одобрил («после компакта запустишь сессию»). Эпопея бункер-калькулятора уже LIVE (#756 OilMonster, #757 ports+API, #758 UI-таблица, #759 retire BunkerIndex; refresh на проде сделан). Это ФОЛЛОУ-АП: фикс багов, найденных при верификации.

## Контекст
Founder открыл реальный матч на проде (короткий каботажный рейс, мелкое судно 3–10k DWT, маршрут ~Средиземка/Чёрное море → Liverpool). Таблица ОТРЕНДЕРИЛАСЬ (UI работает!), нашла Gibraltar. НО верификация чисел («числа, которые видно» — главная фича) поймала баги. Скриншот-данные (доказательства):

```
Бункеровка — сравнение портов · Нужно залить ~2 720 т
Порт            $/т   Крюк        +Топл $  Время×$сут  ЭФФ.$/т
✅ Gibraltar    771   19nm/1.5h   $1367    $950        775.63
   Los Angeles  952   —           —        —           951.50
Рекомендованный сплит: Bunker at GIGIB (771) — saves ~$101,080 vs USLAX
```

## РЕГИОН РАБОТЫ (выведен из писем founder'а, 2026-06-02)

Источник: ~100 фрахтовых циркуляров Feb–May 2026, форварды с `management@etm-services.net` (брокер-операция ETM, партнёр Mostafa Marwan, Александрия). Получатели: vitali6825621@ + Mostafamarwan96@. Это РЕАЛЬНЫЙ рабочий регион — он и задаёт бункер-хабы.

**Регион = Восточное Средиземноморье + Чёрное море + Мраморное/Эгейское + Адриатика, с выходом в Красное море через Суэц. Суда — handysize / мелкий балк 3–30k DWT (часто 4–8k, loa ≤124–145 м).** Грузы: зерно (пшеница/кукуруза/соя), цемент/клинкер, соль, сахар, сталь (billets/HRC/coils/scrap), удобрения, мрамор/блоки, рис в мешках.

Конкретные плечи (load → disch) прямо из писем:
- **Чёрное море:** Odesa/Pivdennyi/Izmail (UA), Constanta/Braila (RO), Varna (BG), Tuapse/Kavkaz (RU), Poti (GE) → Marmara / Mersin / EC Italy / Cyprus / Egypt
- **Турецкие проливы (спина всех маршрутов):** Istanbul / Marmara / Çanakkale / Ambarli / Hereke / Nemrut — через них идёт КАЖДЫЙ рейс Чёрное↔Med
- **East Med / Левант:** Греция, Кипр, Iskenderun/Mersin (TR), Tartous/Latakia (SY), Lebanon
- **Egypt:** Alexandria / Abu Qir / El Arish / El Dekheila / Damietta → POC / Греция / Левант
- **West Med / Сев. Африка:** Italy (Genoa/Vasto/Ravenna/Trapani), Spain Med/Sevilla, Bejaia (DZ), Agadir/Jorf Lasfar (MA)
- **Красное море (через Суэц):** Jeddah, Hodeidah, Berbera, Djibouti, Sudan
- Меньшинство (~10–15%, другой деск): deep-sea EC/WC-India → W.Africa rice, China/Korea small-SID, Brazil-China ore — НЕ ядро, не оптимизировать под них.

**Вывод для бункер-фичи:** текущий пул кандидатов ГЛОБАЛЬНЫЙ (Сингапур/Шанхай/Хьюстон/LA/Сантос/Дурбан) — для Med/Чёрного моря это ШУМ и прямой источник бага #1 (LA «по пути»). Хабы обязаны быть РЕГИОНАЛЬНЫЕ, а отбор кандидатов — привязан к морскому бассейну рейса.

## БАГИ (3 correctness + 1 coverage)
1. **Los Angeles как on-route кандидат для ЕВРОПЕЙСКОГО рейса** — USLAX на тихоокеанском побережье США, физически НЕ может быть «по пути» (детур ~5000+ миль). Показан с «—» (детур не посчитался) но всё равно в списке. **Root:** `bunker-recommendation/route.ts` on-route фильтр через `getPortDistance` (`lib/sailing/port-distances.ts`) — для не-матричных пар haversine **занижает 40-60%** (комментарий в коде) → далёкие порты проходят ≤15%/<200nm фильтр. **Fix:** не пускать кандидата on-route если (а) дистанция-плечо считается haversine-фоллбэком И результат пограничный, ИЛИ (б) детур не вычислился (null), ИЛИ (в) добавить bounding-box/жёсткий cap. Безопаснее: on-route решать только по надёжным (матричным) дистанциям; не-матричные far-ports исключать. **РОБАСТНЕЕ ВСЕГО (data-driven, 2026-06-02):** привязать отбор кандидатов к морскому бассейну рейса — хабы вне бассейна Med/Чёрного моря структурно не попадают в список (см. «РЕГИОН РАБОТЫ»: LA/Asia/Brazil физически не могут быть on-route для Med-каботажа). Это убирает корень, а не симптом.
2. **«Нужно залить ~2 720 т» нереально много** для судна 3–10k DWT (бункер > грузоподъёмности). **Root:** liftTonnes = voyageDays × dailyCons (+reserve); раздулось из-за (а) кривой огромной дистанции (баг 1 / разъехавшийся маршрут) и/или (б) deep-sea дефолта расхода. **Fix:** cap liftTonnes по бункерной ёмкости судна (DWT-производная, ~5–8% DWT) + корректная дистанция (после фикса 1) + расход по классу. Для каботажника lift должен быть десятки–сотни тонн, не тысячи.
3. **ЭФФ.$/т (775.63) НЕ сходится с показанными колонками.** Должно: 771 + (1367+950)/2720 = **771.85**. Лишние **~$3.78/т** (×2720 ≈ $10 282). LA-строка сходится (951.50 = цена, 0 детур → видимо округление 952). Gibraltar — нет. **Гипотеза:** в eff подмешан **углерод EU ETS** (SHOULD-фича #758), но **колонки «Углерод» НЕТ** (в шапке: Порт·$/т·Крюк·+Топл·Время·ЭФФ — без углерода). LA (не-EU плечо) углерода не имеет → сходится; Gibraltar (EU) имеет → расходится. **Fix (ПРИНЦИП founder'а):** каждый $/т в ЭФФ обязан быть ВИДИМОЙ колонкой. Добавить колонку «Углерод $» (из EUA×Cf) → eff = цена+топл+время+углерод, сходится глазами. Если углерод не задумывался — убрать из eff. **Файлы:** `lib/economics/bunker-comparison.ts` (eff формула — Я ВЕРИФИЦИРОВАЛ её в #757 БЕЗ углерода → значит #758 добавил eff-компонент мимо неё, найти где), `components/economics/BunkerComparisonTable.tsx` (колонки).
4. **COVERAGE (вариант A, ТЕПЕРЬ data-driven из писем): региональные бункер-хабы Med/Чёрного моря под РЕАЛЬНЫЕ маршруты founder'а** (см. «РЕГИОН РАБОТЫ»). Сейчас короткие Средиземка/Чёрное-море рейсы показывают почти пусто (только Gibraltar + баговый LA), т.к. пул глобальный. **Fix — расширить PORT_MAP в `lib/knowledge/bunker/oilmonster-adapter.ts` + BUNKER_CANDIDATES (по приоритету):**
   - ⭐⭐ **Constanta `ROCND`** — главный бункер-порт Чёрного моря (масса грузов грузится тут: Constanta/Braila/Varna плечи)
   - ⭐⭐ **Port Said `EGPSD`** — Суэц/Египет/ворота в Красное море (Jeddah/Hodeidah/Sudan плечи)
   - ⭐ **Augusta `ITAUG`** — центральный Med (Сицилия), классический bunker-stop
   - **Ceuta `ESCEU`** — альт Гибралтарского пролива; **Limassol `CYLIM`** — Кипр/East Med
   - (опц.) **Çanakkale `TRCKZ`** — проливы; **Novorossiysk `RUNVS`** — флагнуть sanctions-risk, по умолчанию ВЫКЛ
   - **Уже в 23-пуле и релевантны — СОХРАНИТЬ:** Gibraltar `GIGIB`, Algeciras `ESALG`, Malta `MTMLA`, Piraeus `GRPIR`, Istanbul `TRIST`, Las Palmas `ESLPA`.
   - **Глобальные хабы (Asia/US/Brazil/SAfr: SGSIN/CNSHA/USHOU/USLAX/BRSSZ/ZADUR…) для Med/Чёрноморских рейсов → down-weight/исключить** через region-aware отбор (баг #1).
   Проверить, что OilMonster квотит эти порты (он ≈200 портов; Med/BlSea бункер-хабы там стандартно есть — если нет, log+skip, не падать). **Post-merge: refresh-bunker на проде** (founder-authorized разово).

## КОРЕНЬ (общий)
Движок тюнен под DEEP-SEA (длинные океанские, мировые хабы), а демо-данные founder'а = SHORT-SEA каботаж (мелкие суда, региональные маршруты). Дистанция (haversine far-ports), объём заливки (deep-sea расход), отбор портов (мировые хабы) — всё misbehave на коротких рейсах.

## DISPATCH-ПЛАН (Tier L, systematic-debugging — root-cause не на 100% известен)
- **Цепочка:** brainstorming уже сделан (этот анализ = hypothesis-tree) → writing-plans (эта спека) → subagent-driven-development. Использовать `systematic-debugging` для багов 1-2 (haversine/lift root-cause).
- **Можно 1 сессия L** ИЛИ 2: (S1) correctness баги 1+2+3 [критично, /test-skill — calc+distance], (S2) coverage вариант A [oilmonster PORT_MAP + refresh].
- **Acceptance:** (1) для каботажного рейса НЕТ физически-невозможных портов (LA/далёкие исключены); (2) lift правдоподобный (≤ ёмкости судна); (3) ЭФФ.$/т = сумма ВИДИМЫХ колонок (углерод колонкой); (4) региональные хабы в таблице для Средиземка/Чёрное-море. Founder prod-проверка (Gate5) на том же матче.
- **Файлы:** `app/api/voyage/bunker-recommendation/route.ts`, `lib/sailing/port-distances.ts` (?), `lib/economics/bunker-comparison.ts`, `components/economics/BunkerComparisonTable.tsx`, `components/match/EconomicsTab.tsx` (lift), `lib/knowledge/bunker/oilmonster-adapter.ts` (PORT_MAP), `data/ports/port-master.json` (если новые порты).
- **UI PR (таблица меняется) → Gate3 preview (или founder-visual) + Gate5 USER_CHECKLIST.**
- **Маркеры dispatch:** ROADMAP_READ + CHAIN_<topic>=L creative=y(brainstorm=эта спека) writing_plans=<эта спека>. Worktree off свежего origin/main.

## OPS-факты (как ночью)
- dev-vps dispatch: `root@157.173.124.116`, worktrees `/root/work/quantika-demo/.worktrees/`, `dispatch.sh`.
- prod=outreach-vps `185.249.225.169` (refresh-bunker — founder-authorized разово, прод-write требует явного «go»).
- merge: label `code-only` → auto-merge(SQUASH) → deploy. UI/`.tsx` → preview-gate.
- Полный лог эпопеи: `NIGHT-RUN-bunker-delta.md`. Спека фичи: `bunker-calculator-spec-2026-06-01.md`.
