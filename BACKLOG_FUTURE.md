## Port distances — accurate sea routing (Wave 5 backlog)

**Current state (v1.1.0):** `getPortDistance` возвращает `{ nm, exact }`. Для пар вне hardcoded matrix — haversine great-circle. Погрешность: Med/Baltic ~5-10%, transoceanic до 30% (vessel goes around Africa or via Panama Canal, haversine shows straight line).

**Planned:** Integration of searoutes.com API ($100/mo) OR npm `seaport-distance` for sea-routed distances.

**Estimate:** 1-2 days. Trigger: brokers complain about ETA miss >24h.

**Files:** `lib/sailing/port-distances.ts:getPortDistance`, UI `app/match/[id]/page.tsx`.
