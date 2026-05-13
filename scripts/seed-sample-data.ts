import vessels from '../lib/sample-data/demo-parsed-vessels.json';
import cargoes from '../lib/sample-data/demo-parsed-cargoes.json';
import type { ParsedVessel, ParsedCargo } from '../lib/types';

export function getDemoVessel(): ParsedVessel {
  return vessels[0] as unknown as ParsedVessel;
}

export function getDemoCargo(): ParsedCargo {
  return cargoes[0] as unknown as ParsedCargo;
}

if (require.main === module) {
  const vessel = getDemoVessel();
  const cargo = getDemoCargo();
  console.log('Demo vessel:', (vessel.vesselName as { value?: string } | null)?.value ?? 'unknown');
  console.log('Demo cargo:', (cargo.cargoDescription as { value?: string } | null)?.value ?? 'unknown');
  console.log('Sample match ready for EconomicsTab testing.');
}
