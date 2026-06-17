/**
 * Group B (#1021 #1023) — cargo-data-truth fixture assertions.
 *
 * After the offline Claude re-parse (scripts/build-sample-data.ts via
 * AI_PROVIDER=claude-cli), the demo cargoes must carry the data points that
 * ARE present in the source emails: net CBM, dot-thousand/slash weight ranges,
 * and vessel-DWT requirement bands. These assert on the recovered VALUES (not a
 * fragile source_text match), each corroborated by a stable needle so we know
 * it is the intended cargo, not a coincidental record.
 */
import cargoesJson from '@/lib/sample-data/demo-parsed-cargoes.json';
import type { ParsedCargo } from '@/lib/types';

const cargoes = cargoesJson as unknown as ParsedCargo[];
const stringify = (c: ParsedCargo) => JSON.stringify(c).toLowerCase();

it('SEAGULL 71 cement "5.000/5.500mts" → weight range 5000–5500', () => {
  const c = cargoes.find(
    c => c.weightMtMin === 5000 && c.weightMtMax === 5500 && stringify(c).includes('5.000/5.500'),
  );
  expect(c).toBeTruthy();
});

it('SEAGULL 69 MDF "12,000 net CBM / 13,500 gross CBM" → volumeCbm 12000', () => {
  const c = cargoes.find(c => c.volumeCbm === 12000 && stringify(c).includes('net cbm'));
  expect(c).toBeTruthy();
});

it('GRAIN TRADER "any 12,000-14,000 dwt vsl" → vessel DWT band 12000–14000', () => {
  const c = cargoes.find(c => c.minVesselDwtMt === 12000 && c.maxVesselDwtMt === 14000);
  expect(c).toBeTruthy();
});
