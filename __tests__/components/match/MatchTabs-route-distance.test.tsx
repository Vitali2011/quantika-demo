/**
 * @jest-environment jsdom
 *
 * PI2 behavioral: MatchTabs must pass storedDistanceNm (laden) to EconomicsTab,
 * NOT readiness.distanceNm (ballast). Fix A regression guard (#fix-list-vs-detail).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

// Capture the routeDistanceNm prop that EconomicsTab receives
let capturedRouteDistanceNm: number | null | undefined = undefined;

jest.mock('@/components/match/EconomicsTab', () => ({
  EconomicsTab: (props: { routeDistanceNm?: number | null }) => {
    capturedRouteDistanceNm = props.routeDistanceNm;
    return null;
  },
}));

jest.mock('@/components/match/VesselsTab', () => ({ VesselsTab: () => null }));
jest.mock('@/components/match/PassportTab', () => ({ PassportTab: () => null }));
jest.mock('@/components/match/QuoteTab', () => ({ QuoteTab: () => null }));
jest.mock('@/lib/confidence', () => ({
  getConfidenceColorClass: () => 'border-blue-500',
}));

import { MatchTabs } from '@/components/match/MatchTabs';
import type { Match } from '@/lib/types';

const BALLAST_DISTANCE_NM = 415;
const LADEN_DISTANCE_NM = 254;

function makeMatch(readinessDistanceNm: number | undefined): Match {
  return {
    cargoEmailId: 'cargo-1',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-1',
    vesselItemIndex: 0,
    score: 75,
    matchLevel: 'good',
    matchReasons: [],
    issues: [],
    readiness: readinessDistanceNm !== undefined
      ? { distanceNm: readinessDistanceNm, openDate: null, openPosition: null }
      : undefined,
  } as unknown as Match;
}

function clickEconomicsTab(container: HTMLElement) {
  const tabs = container.querySelectorAll('[role="tab"]');
  const econ = Array.from(tabs).find(t => t.textContent === 'Economics');
  if (econ) fireEvent.click(econ);
}

describe('MatchTabs — routeDistanceNm prop forwarding (Fix A)', () => {
  beforeEach(() => { capturedRouteDistanceNm = undefined; });

  test('uses storedDistanceNm (laden) even when readiness.distanceNm (ballast) is present', () => {
    const match = makeMatch(BALLAST_DISTANCE_NM);

    const { container } = render(
      <MatchTabs
        match={match}
        storedDistanceNm={LADEN_DISTANCE_NM}
        matchDbId={1}
      />,
    );

    clickEconomicsTab(container);

    expect(capturedRouteDistanceNm).toBe(LADEN_DISTANCE_NM);
    expect(capturedRouteDistanceNm).not.toBe(BALLAST_DISTANCE_NM);
  });

  test('passes null when storedDistanceNm is null (no readiness fallback)', () => {
    const match = makeMatch(BALLAST_DISTANCE_NM);

    const { container } = render(
      <MatchTabs
        match={match}
        storedDistanceNm={null}
        matchDbId={1}
      />,
    );

    clickEconomicsTab(container);

    expect(capturedRouteDistanceNm).toBeNull();
  });

  test('passes null when neither storedDistanceNm nor readiness.distanceNm', () => {
    const match = makeMatch(undefined);

    const { container } = render(
      <MatchTabs
        match={match}
        matchDbId={1}
      />,
    );

    clickEconomicsTab(container);

    expect(capturedRouteDistanceNm).toBeNull();
  });
});
