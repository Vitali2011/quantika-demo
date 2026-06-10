/* Throwaway diag: replicate /api/voyage/bunker-recommendation winner for demo routes,
   to confirm whether the recommendation overrides the default NLRTM bunker port (which
   would make the DETAIL headline TCE diverge from the LIST, which is fixed at NLRTM). */
import Database from 'better-sqlite3';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { computeBunkerComparison } from '@/lib/economics/bunker-comparison';
import { isCandidateInVoyageBasins } from '@/lib/sailing/voyage-basin';

const BUNKER_CANDIDATES = [
  'SGSIN','CNZOS','HKHKG','KRPUS','CNSHA','TWKHH','LKCMB','AEFJR','SAJED',
  'NLRTM','BEANR','GIGIB','ESALG','ESLPA','GRPIR','TRIST','MTMLA',
  'ROCND','EGPSD','ITAUG','ESCEU','CYLMS','USHOU','USNYC','PABLB','BRSSZ','USLAX','ZADUR',
];
const DETOUR_RATIO = 0.15, DETOUR_ABS_CAP_NM = 200;

const db = new Database('data/demo-seed.db', { readonly: true });

function reco(from: string, to: string, dwt: number) {
  const directNm = getPortDistance(from, to)?.nm ?? null;
  const onRoute: Array<{ port: string; price: number; deviationNm: number }> = [];
  for (const c of BUNKER_CANDIDATES) {
    if (!isCandidateInVoyageBasins(c, from, to)) continue;
    const row = getLatestBunkerPrice(db as never, c, 'VLSFO');
    if (!row) continue;
    let deviationNm = 0;
    if (directNm != null) {
      const l1 = getPortDistance(from, c), l2 = getPortDistance(c, to);
      if (l1 && l2) {
        const detour = l1.nm + l2.nm - directNm;
        if (detour > Math.max(DETOUR_RATIO * directNm, DETOUR_ABS_CAP_NM)) continue;
        deviationNm = detour;
      }
    }
    onRoute.push({ port: c, price: row.price_usd_per_mt, deviationNm });
  }
  if (onRoute.length === 0) return { from, to, fallback: true };
  const cands = computeBunkerComparison({
    candidates: onRoute.map((o) => ({ port: o.port, grade: 'VLSFO', priceUsdPerMt: o.price, deviationNm: o.deviationNm })),
    vesselSpeedKn: 12, dailyConsMtPerDay: 20, liftTonnes: 500, vesselDayRateUsd: 15000,
  });
  const winner = cands[0];
  return {
    from, to, fallback: false,
    winnerPort: winner?.port, winnerRawPrice: onRoute.find((o) => o.port === winner?.port)?.price,
    nlrtmPriced: onRoute.find((o) => o.port === 'NLRTM')?.price ?? null,
    onRoutePorts: onRoute.map((o) => `${o.port}@${o.price}`).join(', '),
  };
}

for (const [f, t, d] of [
  ['Nemrut Bay', 'Liverpool', 8100],
  ['Iskenderun', 'Greece', 5129],
  ['Chornomorsk', 'Marghera', 9000],
  ['Karasu', 'Puerto Limon', 12000],
] as Array<[string, string, number]>) {
  console.log(JSON.stringify(reco(f, t, d)));
}
