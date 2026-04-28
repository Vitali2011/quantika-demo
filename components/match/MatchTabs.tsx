'use client';

import { useState } from 'react';
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
}

export function MatchTabs({ match, vessel, cargo, cargoEmailId }: MatchTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('vessels');

  const confidenceLevel = match.confidence?.level ?? 'missing';
  const borderClass = getConfidenceColorClass(confidenceLevel);

  return (
    <div className={`rounded-lg border-2 bg-white ${borderClass}`}>
      {/* Tab navigation */}
      <div className="flex border-b" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
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
      <div className="p-4">
        {activeTab === 'vessels' && (
          <VesselsTab vessel={vessel} />
        )}
        {activeTab === 'economics' && (
          <EconomicsTab commissionPercent={cargo?.commissionPercent} />
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
