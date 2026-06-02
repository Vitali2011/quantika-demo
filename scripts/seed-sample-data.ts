import vessels from '../lib/sample-data/demo-parsed-vessels.json';
import cargoes from '../lib/sample-data/demo-parsed-cargoes.json';
import type { ParsedVessel, ParsedCargo } from '../lib/types';

/** Unwrap a ConfidenceField ({value,...}) or pass a plain value through. */
function cfVal(x: unknown): unknown {
  return x && typeof x === 'object' && 'value' in (x as object)
    ? (x as { value: unknown }).value
    : x;
}

// EconomicsTab needs a representative COMPLETE record. The parsed JSON is
// multi-item per email and order is not stable across re-parses, so pick the
// first record that actually carries the fields the tab requires rather than
// blindly trusting index 0 (which may be a no-weight item of a split email).
export function getDemoVessel(): ParsedVessel {
  const pick = (vessels as Array<Record<string, unknown>>).find(
    (v) => cfVal(v.dwtSummer) != null,
  );
  return (pick ?? vessels[0]) as unknown as ParsedVessel;
}

export function getDemoCargo(): ParsedCargo {
  const pick = (cargoes as Array<Record<string, unknown>>).find(
    (c) =>
      cfVal(c.weightMt) != null &&
      cfVal(c.originPort) != null &&
      cfVal(c.destinationPort) != null,
  );
  return (pick ?? cargoes[0]) as unknown as ParsedCargo;
}

if (require.main === module) {
  const vessel = getDemoVessel();
  const cargo = getDemoCargo();
  console.log('Demo vessel:', (vessel.vesselName as { value?: string } | null)?.value ?? 'unknown');
  console.log('Demo cargo:', (cargo.cargoDescription as { value?: string } | null)?.value ?? 'unknown');
  console.log('Sample match ready for EconomicsTab testing.');
}
