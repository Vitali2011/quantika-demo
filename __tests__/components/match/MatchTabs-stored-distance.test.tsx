/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MatchTabs } from '@/components/match/MatchTabs';
import type { Match, ParsedVessel } from '@/lib/types';

beforeEach(() => {
  process.env.NEXT_PUBLIC_FUELEU_ENABLED = 'true';
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, json: () => Promise.resolve(null),
  } as unknown as Response);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_FUELEU_ENABLED;
  jest.restoreAllMocks();
});

const match: Match = {
  cargoEmailId: 'cargo-1', cargoItemIndex: 0,
  vesselEmailId: 'vessel-1', vesselItemIndex: 0,
  score: 80, matchLevel: 'good',
  matchReasons: [], issues: [],
  // readiness.distanceNm intentionally absent (null fallback)
};

const vesselWithSpeed = {
  emailId: 'vessel-1', itemIndex: 0,
  vesselName: { value: 'MV Distance', confidence: 'confirmed' as const },
  dwtSummer: { value: 56_000, confidence: 'confirmed' as const },
  speedLaden: '13 kts',
  consumption: '26 mt/day',
  openPosition: null, openDate: null, restrictions: [], specialFeatures: [],
} as unknown as ParsedVessel;

describe('MatchTabs storedDistanceNm fallback', () => {
  test('fueleu-distance-missing shown when no distance provided', async () => {
    await act(async () => {
      render(<MatchTabs match={match} vessel={vesselWithSpeed} />);
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Economics' }));
    // No distance → voyageDays = 0 → fueleu-distance-missing shown
    expect(screen.getByTestId('fueleu-distance-missing')).toBeInTheDocument();
  });

  test('fueleu-distance-missing absent when storedDistanceNm provided and vessel has speed', async () => {
    await act(async () => {
      render(<MatchTabs match={match} vessel={vesselWithSpeed} storedDistanceNm={5_000} />);
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Economics' }));
    // storedDistanceNm=5000 + speed=13kts → voyageDays>0 → fueleu-distance-missing hidden
    expect(screen.queryByTestId('fueleu-distance-missing')).not.toBeInTheDocument();
  });
});
