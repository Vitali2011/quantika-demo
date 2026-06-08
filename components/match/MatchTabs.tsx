'use client';

import { useId, useState } from 'react';
import { getConfidenceColorClass } from '@/lib/confidence';
import type { Match, ParsedVessel, ParsedCargo } from '@/lib/types';
import { VesselsTab } from './VesselsTab';
import { EconomicsTab } from './EconomicsTab';
import { PassportTab } from './PassportTab';
import { QuoteTab } from './QuoteTab';

type TabId = 'vessels' | 'economics' | 'passport' | 'quote';

const TABS: { id: TabId; label: string }[] = [
  { id: 'vessels', label: 'Vessels' },
  { id: 'economics', label: 'Economics' },
  { id: 'passport', label: 'Passport' },
  { id: 'quote', label: 'Quote' },
];

interface MatchTabsProps {
  match: Match;
  vessel?: ParsedVessel;
  cargo?: ParsedCargo;
  cargoEmailId?: string;
  matchDbId?: number;
  storedFreightRate?: number | null;
  freightRateSource?: string | null;
  storedDistanceNm?: number | null;
  storedTceUsdPerDay?: number | null;
  /** Ballast reposition distance (open position → load port, nm). Passed to EconomicsTab
   *  so the detail view uses single-voyage duration — matching the stored LIST TCE. */
  ballastDistanceNm?: number | null;
}

export function MatchTabs({ match, vessel, cargo, cargoEmailId, matchDbId, storedFreightRate, freightRateSource, storedDistanceNm, storedTceUsdPerDay, ballastDistanceNm }: MatchTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('vessels');
  const uid = useId();

  const confidenceLevel = match.confidence?.level ?? 'missing';
  const borderClass = getConfidenceColorClass(confidenceLevel);

  return (
    <div className={`rounded-lg border-2 bg-white ${borderClass}`}>
      {/* Tab navigation */}
      <div className="flex border-b" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`${uid}-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        role="tabpanel"
        id={`${uid}-panel-${activeTab}`}
        aria-labelledby={`${uid}-tab-${activeTab}`}
        className="p-4"
      >
        {activeTab === 'vessels' && (
          <VesselsTab vessel={vessel} newCargo={cargo?.cargoDescription?.value ?? undefined} />
        )}
        {activeTab === 'economics' && (
          <EconomicsTab
            commissionPercent={cargo?.commissionPercent}
            vessel={vessel}
            cargo={cargo}
            routeDistanceNm={storedDistanceNm ?? null}
            matchDbId={matchDbId}
            storedFreightRate={storedFreightRate}
            freightRateSource={freightRateSource}
            warRiskPremium={match.economics?.breakdown?.warRiskPremium ?? null}
            warRiskZones={match.economics?.breakdown?.warRiskZones ?? null}
            warRiskBreakdown={match.economics?.breakdown?.warRiskBreakdown ?? null}
            warRiskBreakdownBallast={match.economics?.breakdown?.warRiskBreakdownBallast ?? null}
            warRiskZonesBallast={match.economics?.breakdown?.warRiskZonesBallast ?? null}
            storedTceUsdPerDay={storedTceUsdPerDay}
            ballastDistanceNm={ballastDistanceNm}
          />
        )}
        {activeTab === 'passport' && (
          <PassportTab vessel={vessel} />
        )}
        {activeTab === 'quote' && (
          <QuoteTab
            cargoEmailId={cargoEmailId}
            confidence={match.confidence}
          />
        )}
      </div>
    </div>
  );
}
