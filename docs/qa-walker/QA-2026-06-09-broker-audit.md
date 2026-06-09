# QA Walker — Quantika Demo, брокер-аудит 2026-06-09

Target: https://demo.quantika.org · mode: full + top-10 provenance + broker roam
Auth: admin demo. Браузер: Chrome MCP.

**Вывод:** матчинг и парсинг сути — здоровы (движок парит и пары строит верно). Чинить
надо отображение/экономику + сломанную генерацию котировки.

---

## 🔴 HIGH

### A. AI Draft Quote сломан (500, молча) — NEW
- **Где:** `/match/[id]` → Quote tab → кнопка **Generate**.
- **Что:** `POST /api/ai/draft-quote` → **HTTP 500**. Черновик остаётся пустым,
  пользователю **не показывается ни тост, ни ошибка**. Брокер жмёт — тишина.
- **核 ядро продукта** (генерация котировки) молча мёртвое.
- По сути **reopen #666** (был помечен устаревшим — зря).
- **Severity: high · Class: A (silent error)**
- Repro: открыть любой матч → Quote → Generate → network показывает 500, textarea пуст.

### B. Война-риск: P&L занижает war-risk (#883 морфнул)
- **Где:** `/match/[id]` (route через Red Sea/Gulf of Aden, напр. Nemrut Bay→Berbera) → Economics.
- **Что:** секция «JWC War Risk — Laden Voyage» считает Hull $667 + Crew $10,000 +
  P&I $20,000 = **Total $30,667**. Но строка Voyage Cost Breakdown «War Risk: **$667**»
  берёт только hull → **TCE недосчитывает ~$30k** crew+P&I.
- (Старое противоречие «No JWC zones» vs «$667» больше НЕ воспроизводится — секция
  теперь рендерится корректно по геогафии.)
- **Severity: high · Class: B** · issue **#883** (обновить симптом).

### C. SEAGULL 41 — битая вместимость трюма → ложные «overflow» (#884)
- **Где:** vessel `19e07d53e7d46b71` (SEAGULL 41, 3178 DWT). В 5 из 10 топ-матчей.
- **Что:** `grainCapacity:3994, grainCapacityUnit:"cbft"` — ~40× мало для 3178 DWT
  (у сестёр: SEAGULL 37 = 197 500 cbft, SEAGULL 71 = 10 194 cbm, SEAGULL 78 = 3990 cbm).
  Карточка ещё и мислейблит единицу: исходник cbft → рендерит «3 994 CBM».
- **Следствие:** ложные «cargo takes ~104%/~101% of grain capacity — overflows holds»
  (матчи #2, #3), Volume/hold-fit падает до 27%.
- **Severity: high · Class: B** · issue **#884** · ✅ переподтверждён на свежих id.

### D. Вес груза рассинхрон по экранам (#865)
- **Что:** один и тот же груз показывает **до 4 разных значений веса**:
  - Explain modal + compat-таблица: **2 720 mt**
  - Source Attribution + Fit breakdown + рус. P&L («× 2 774 т»): **2 774 mt**
  - worksheet_json (`weightMt`): **2 800 mt**
  - на Berbera-матче: compat 2 800 / «90% util ✅» vs fit 3 080 / «104% overflow»
- Видный зелёный ✅ util бывает оптимистично-неверным.
- **Severity: high · Class: B** · issue **#865** (расширить: ≥5 матчей).

### E. English-only: русский P&L-расчёт (#864)
- **Где:** `/match/[id]` → Economics → «Show calculation» (раскрыть).
- **Что:** кнопка-label теперь English, но раскрытая панель целиком РУССКАЯ:
  «ВЫРУЧКА ЗА РЕЙС (ЧТО ПЛАТИТ ФРАХТОВАТЕЛЬ)», «Ставка фрахта × 2 774 т», «Выручка»,
  «МИНУС РАСХОДЫ РЕЙСА», «Топливо… расход 6 т/день · цена $735/т»,
  «Каналы — маршрут не идёт через Суэц/Босфор», «Портовые сборы», «Военный риск».
- **Severity: high · Class: E (i18n)** · issue **#864** · ✅ переподтверждён.

---

## 🟡 MEDIUM / broker-credibility

### F. Две конкурирующие оценки на каждой карточке — NEW
- На карточке матча и в Explain рядом: **«Fit 92%»** и **«score 84/100»**.
  Брокеру неясно, какая ранжирует список. Нужна одна метрика или пояснение.
- **Severity: low-med · Class: B**

---

## 🟢 LOW

| # | Баг | Где |
|---|---|---|
| G | Override-плейсхолдер бункера хардкод «Rotterdam VLSFO» вне зависимости от маршрута (движок выбирает порт верно — Ceuta/Piraeus/Fujairah — но label вводит в заблуждение) | match Economics |
| H | TCE $30.8k в списке vs Economics P&L «Missing cargo quantity» (откуда число при не-распарсенном qty?) | match #5 / list |
| I | Owner-mode дефолт-сорт = Fit% (спека ждёт TCE/day для owner) | /matches |
| J | /settings — нет секции «Export» (есть Profile…Invoices/Danger zone) | /settings |
| K | Синтетика SEAGULL-N: 3 разных судна с именем «SEAGULL 41» (разные порты/даты); открытая позиция отрисована как «AGENT 3» (анонимизация затёрла порт) | /vessels |
| L | /clauses фильтр-дропдаун (GENCON 2022/HEAVYCON/PROJECTCON) ≠ корпус (выдаёт NYPE 1946/SHELLVOY 6) | /clauses |
| M | PSC поиск: Enter не сабмитит, только кнопка Search | /psc |
| N | /email тела писем — сырые анонимизация-токены «CONTACT 6 <CONTACT broker@demo.local>», «SENDER 3» (by-design scrub, но малформед-рендер) | /email |

---

## ✅ РАБОТАЕТ ХОРОШО (доверие брокера)

- **Пары верны (топ-10):** все 10 коммерчески осмысленны — тайминг, география в лейкан,
  размер. Сверка SEAGULL 41 с исходным письмом-позишн-листом: Bourgas / 04 июн / 3178 DWT /
  gearless — совпало до буквы. Multi-vessel на одно карго (#7/#8 Izmail→Antalya) — НЕ дубль.
- **Парсинг ключевых полей** трассируется к исходным письмам (порты, лейкан, коммодити, открытая позиция).
- **Честные empty-state:** «weight not stated → scored conservatively» когда письмо реально без веса (#5, #10).
- Explain this deal — без галлюцинаций; /clauses RAG — реальные NYPE/SHELLVOY клаузы.
- Бункер-геогафия route-aware: Ceuta/Gibraltar (Med→UK), Fujairah (India→ME), Port Said (Suez-транзит).
- /laytime, /psc, /commission, /market (графики+фиксы), ⌘K палитра+actions,
  фильтры matches (Fit80+ 66→9), Cards/Table toggle, Fit Breakdown toggle — все живые.
- Dashboard CTA href валидны (/match/57252, нет /match/0). English-only по всему UI кроме E.
- /cargo 8/8 колонок видимы, /vessels 7/7 — старые CSS-регрессии исправлены.
- Display-баг 06-03 «THIS→MONF» исправлен (рендерит «Thisvi → Monfalcone»).

---

## GitHub issues (заведены/связаны)

| Баг | Issue |
|---|---|
| E (рус. Economics) | #864 |
| B (war-risk) | #883 |
| C (SEAGULL41 capacity) | #884 |
| D (вес рассинхрон) | #865 |
| K (low-связка) | #885 |
| A (draft-quote 500) | **не заведён — кандидат на новый high / reopen #666** |
| F (две оценки) | не заведён |

*Filed by /qa-walker on 2026-06-09.*
