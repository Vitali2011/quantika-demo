#!/usr/bin/env -S npx tsx
/**
 * golden-candidates.ts — DEV TOOL (read-only, throwaway).
 * Feeds ALL 2026 cargoes × ALL 2026 vessels (real specs from .private/raw-emails)
 * to the real engine and prints the resulting board — so we pick golden exemplars
 * from what the engine ACTUALLY produces (good matches = controls; mishandled = bug exemplars).
 *
 * Frozen "now" = 2026-05-10 (May/June laycans are future).
 * Fields marked /*est* /  are estimates where the email body was cut/absent.
 * Some open-positions substituted with a nearby real port (Marmara→Bandirma, Praia Mole→Tubarao).
 */
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { buildCargo, buildVessel } from '@/lib/matching/__tests__/golden-set/runner';
import type { GoldenRecord } from '@/lib/matching/__tests__/golden-set/schema';

const TODAY = new Date('2026-05-10T00:00:00.000Z');
type CIn = GoldenRecord['inputs']['cargo'];
type VIn = GoldenRecord['inputs']['vessel'];

const cg = (ref: string, qtyT: number, cargoType: string, loadPort: string, dischPort: string,
  laycanStart: string, laycanEnd: string, qtyMinT?: number, qtyMaxT?: number): CIn =>
  ({ ref, qtyT, qtyMinT, qtyMaxT, cargoType, loadPort, dischPort, laycanStart, laycanEnd, sourceEmail: 'corpus' });
const vs = (name: string, dwt: number, o: Partial<VIn>): VIn =>
  ({ name, dwt, openPort: 'Unknown', openDate: '2026-05-15', speedKn: null, consumptionT: null, sourceEmail: 'corpus', ...o });

const cargoes: CIn[] = [
  cg('steel10k Odessa→Aliaga', 10000, 'STEEL', 'Odessa', 'Aliaga', '2026-05-15', '2026-05-20'),
  cg('cem3k Iskenderun→Piraeus', 3000, 'CEMENT', 'Iskenderun', 'Piraeus', '2026-05-11', '2026-05-16'),
  cg('coal22k Mtwara→Matadi', 22000, 'COAL', 'Mtwara', 'Matadi', '2026-06-01', '2026-06-10', 19800, 24200),
  cg('ore55k ECIndia→China', 55000, 'IRON ORE', 'Visakhapatnam', 'Qingdao', '2026-05-15', '2026-05-24', 49500, 60500),
  cg('sugar70k Santos→WCIndia', 70000, 'SUGAR', 'Santos', 'Mundra', '2026-07-07', '2026-07-15', 63000, 77000),
  cg('steel6.5k Nemrut→Constanta', 6500, 'STEEL', 'Nemrut', 'Constanta', '2026-05-22', '2026-05-25'),
  cg('cem6-7k ElArish→Tartous', 6500, 'CEMENT', 'El Arish', 'Tartous', '2026-05-14', '2026-05-20', 6000, 7000),
  cg('salt4-4.8k Egypt→Odesa', 4400, 'SALT', 'Damietta', 'Odesa', '2026-05-12', '2026-05-18', 4000, 4800),
];

const vessels: VIn[] = [
  vs('AMITY 29996', 29996, { dwccT: 28500, geared: true, craneCapacityT: 30, speedKn: 10, openPort: 'Bizerte', openDate: '2026-05-14' }),
  vs('FAITH 30116', 30116, { dwccT: 28500, geared: true, craneCapacityT: 30, speedKn: 12, openPort: 'Tubarao', openDate: '2026-05-15' }),
  vs('HACI-HILMI 6976', 6976, { dwccT: 6750, geared: true, craneCapacityT: 10, openPort: 'Bandirma', openDate: '2026-05-22' }),
  vs('TBN 17k', 17000, { dwccT: 16000, geared: true, craneCapacityT: 10, openPort: 'Gibraltar', openDate: '2026-05-24' }),
  vs('LADY-ANITA ~5k', 5000 /*est GRT2998*/, { dwccT: 4800, geared: false, openPort: 'Jeddah', openDate: '2026-05-12' }),
  vs('Sky-Str 5129', 5129, { dwccT: 4900, geared: true, openPort: 'Ravenna', openDate: '2026-05-09' }),
  vs('Sky-Falcon 3821', 3821, { dwccT: 3650, geared: true, openPort: 'Liverpool', openDate: '2026-05-18' }),
  vs('Sky-Dolphin 3821', 3821, { dwccT: 3650, geared: true, openPort: 'Gemlik', openDate: '2026-05-18' }),
];

(async () => {
  const ps_c = cargoes.map(buildCargo);
  const ps_v = vessels.map(buildVessel);
  const res = await analyzePairs(ps_c, ps_v, async () => [], { today: TODAY });

  const ladenOf = (cref: string) => {
    const c = cargoes.find((x) => x.ref === cref)!;
    return getPortDistance(c.loadPort, c.dischPort)?.nm ?? null;
  };
  const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);

  const rows: { bucket: string; c: string; v: string; score: number; lvl: string; laden: number | null; tce: number | null }[] = [];
  const push = (bucket: string, arr: typeof res.matches) => arr.forEach((m) =>
    rows.push({ bucket, c: m.cargoEmailId, v: m.vesselEmailId, score: m.score, lvl: m.matchLevel ?? '—',
      laden: ladenOf(m.cargoEmailId), tce: m.economics?.tceUsdPerDay ?? null }));
  push('MAIN', res.matches);
  push('review', res.lowConfidenceMatches);
  push('insuf', res.insufficientData);
  rows.sort((a, b) => b.score - a.score);

  console.log(`frozen now = 2026-05-10 · ${cargoes.length} cargoes × ${vessels.length} vessels = ${cargoes.length * vessels.length} pairs\n`);
  console.log(`=== NON-BLOCKED: ${rows.length} (engine considers these) ===`);
  console.log(pad('cargo', 28), pad('vessel', 17), pad('bucket', 7), pad('score', 6), pad('level', 9), pad('ladenNm', 8), 'tce/day');
  console.log('─'.repeat(100));
  for (const r of rows) console.log(
    pad(r.c, 28), pad(r.v, 17), pad(r.bucket, 7), pad(String(r.score), 6), pad(r.lvl, 9),
    pad(String(r.laden ?? '—'), 8), r.tce == null ? '—' : '$' + Math.round(r.tce).toLocaleString());

  const byReason = new Map<string, string[]>();
  for (const b of res.blockedMatches) {
    const key = b.filterReason.replace(/\d{4}-\d{2}-\d{2}/g, 'DATE').replace(/\s+[A-Z][a-z]+(?=\s|$)/g, '').slice(0, 46);
    const pair = `${b.cargoEmailId.split(' ')[0]}×${b.vesselEmailId.split(' ')[0]}`;
    (byReason.get(key) ?? byReason.set(key, []).get(key)!).push(pair);
  }
  console.log(`\n=== BLOCKED: ${res.blockedMatches.length} — grouped by reason ===`);
  [...byReason.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) =>
    console.log(`  [${v.length}] ${k}\n      e.g. ${v.slice(0, 4).join(', ')}`));
})();
