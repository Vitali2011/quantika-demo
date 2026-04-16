# ROADMAP — Port Regions helper

## User story

Как брокер, я хочу видеть регион порта (Black Sea / Mediterranean / Northern Europe /
Atlantic / Asia / Americas / West Africa) рядом с именем порта в match-карточке,
чтобы быстро фильтровать кандидатов по географии без запоминания, к какому бассейну
относится каждый порт. Например, при поиске vessel на grain shipment из Украины в
Турцию я хочу моментально отсеивать Atlantic-kokpit и видеть только Black Sea +
Mediterranean.

## Контекст

- Проект: `quantika-demo` — Next.js 14, TypeScript, Jest, app-router.
- Стек уже имеет хардкодные данные по портам в `lib/sailing/port-master.ts`
  (~35 портов) и canonical `KnownPort` union в `lib/sailing/port-distances.ts`.
- Задача — чисто additive: новые файлы + helpers, никаких breaking изменений
  публичного API.

## Deliverables

### 1. `lib/sailing/port-regions.ts` — helper и lookup table

Новый модуль с:

- `type PortRegion = 'BlackSea' | 'Mediterranean' | 'NorthernEurope' | 'Atlantic' | 'Asia' | 'Americas' | 'WestAfrica'`
- `getPortRegion(portName: string | null | undefined): PortRegion | null`
  — нормализует имя через `normalizePortName` из `port-distances.ts` и
  возвращает регион по hardcoded mapping для всех 35 `KnownPort` entries.
- Все порты из `KnownPort` union должны иметь запись в mapping; отсутствие
  entry для любого `KnownPort` — это contract bug, проверить в тестах.
- Функция должна возвращать `null` для неизвестных портов, `''`, `null`, `undefined`.

**Acceptance:**

- `FILE: lib/sailing/port-regions.ts EXISTS`
- `CMD_EXITS_ZERO: npx tsc --noEmit lib/sailing/port-regions.ts 2>&1 | head -20 || true` — модуль компилируется без TS-ошибок (при `ignoreBuildErrors=true` сейчас не гарантирует, но тест даст сигнал).
- `RUN: npm test -- lib/sailing/__tests__/port-regions.test.ts` — все unit-тесты зелёные.

### 2. `lib/sailing/__tests__/port-regions.test.ts` — coverage

Unit-тесты проверяющие:

- Все 35 `KnownPort` ports имеют корректный регион (exhaustive list).
- Black Sea: Karasu, Istanbul, Mykolaiv, Odesa, Chornomorsk, Constanta, Varna, Burgas, Novorossiysk.
- Northern Europe: Antwerp, Hamburg, Rotterdam, Bremen, Halsvik, Gdansk, Bayonne.
- Unknown port (`'Nonexistent'`, `null`, `undefined`, `''`) → `null`.
- Case-insensitive lookup (`'karasu'` → BlackSea, `'KARASU'` → BlackSea).

**Acceptance:**

- `FILE: lib/sailing/__tests__/port-regions.test.ts EXISTS`
- `RUN: npm test -- port-regions` — все кейсы зелёные.

### 3. Integration: экспорт `region` поля в `PortMaster` interface (опционально)

Расширить `PortMaster` interface в `lib/sailing/port-master.ts`:

- Добавить optional `region?: PortRegion` поле.
- `getPortMaster()` возвращает enriched объект с `region` значением через `getPortRegion()`.
- Existing тесты `port-master.test.ts` не должны сломаться — поле optional.

**Acceptance:**

- `FILE: lib/sailing/port-master.ts CONTAINS region?: PortRegion`
- `RUN: npm test -- port-master` — existing тесты продолжают зелёные.
- `RUN: npm test -- match-` — integration тесты остаются зелёными (regression guard).
- `CMD_EXITS_ZERO: npm run lint` — eslint clean.
