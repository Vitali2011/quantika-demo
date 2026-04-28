import type { ParsedVessel } from '@/lib/types';
import { safeRender } from '@/lib/ui-render';

interface VesselsTabProps {
  vessel?: ParsedVessel;
}

export function VesselsTab({ vessel }: VesselsTabProps) {
  return (
    <div data-testid="tab-vessels" className="space-y-3 text-sm">
      {!vessel ? (
        <p className="text-gray-500">No vessel data available.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {vessel.imo && (
              <div>
                <span className="text-gray-500">IMO</span>
                <p className="font-medium">{vessel.imo}</p>
              </div>
            )}
            {vessel.flag && (
              <div>
                <span className="text-gray-500">Flag</span>
                <p className="font-medium">{vessel.flag}</p>
              </div>
            )}
            {vessel.built && (
              <div>
                <span className="text-gray-500">Built</span>
                <p className="font-medium">{vessel.built}</p>
              </div>
            )}
            {vessel.dwtSummer && (
              <div>
                <span className="text-gray-500">DWT</span>
                <p className="font-medium">{safeRender(vessel.dwtSummer.value)} MT</p>
              </div>
            )}
            {vessel.holdsCount != null && (
              <div>
                <span className="text-gray-500">Holds</span>
                <p className="font-medium">{vessel.holdsCount}</p>
              </div>
            )}
            {vessel.baleCapacity != null && (
              <div>
                <span className="text-gray-500">Bale Capacity</span>
                <p className="font-medium">{vessel.baleCapacity.toLocaleString()} CBM</p>
              </div>
            )}
            {vessel.craneCapacity && (
              <div>
                <span className="text-gray-500">Cranes / SWL</span>
                <p className="font-medium">{vessel.craneCapacity}</p>
              </div>
            )}
            {vessel.vesselType && (
              <div>
                <span className="text-gray-500">Type</span>
                <p className="font-medium">{safeRender(vessel.vesselType)}</p>
              </div>
            )}
          </div>
          {vessel.verificationWarning && (
            <p className="text-orange-700 bg-orange-50 rounded p-2 text-xs">
              ⚠ {vessel.verificationWarning}
            </p>
          )}
        </>
      )}
    </div>
  );
}
