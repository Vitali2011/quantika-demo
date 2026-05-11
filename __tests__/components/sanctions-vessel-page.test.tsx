/**
 * @jest-environment jsdom
 *
 * TDD: RED phase — Sanctions badge integration tests
 * Tests that vessel and cargo detail pages show SANCTIONS BLOCKED badge
 * when the entity appears in session.blockedMatches with sanctions.blocking=true.
 *
 * PI2: Uses getByRole/getByText RTL queries, not innerHTML substring matching.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SanctionsBadge } from '@/components/vessel/SanctionsBadge';
import type { BlockedMatch } from '@/lib/types';

// Helper: build a blocked match with sanctions
function makeBlockedMatch(
  vesselEmailId: string,
  cargoEmailId = 'cargo-001',
  reason = 'IR-flagged vessel — OFAC/EU sanctions apply',
): BlockedMatch {
  return {
    cargoEmailId,
    cargoItemIndex: 0,
    vesselEmailId,
    vesselItemIndex: 0,
    filterReason: reason,
    sanctions: { risk: 'HIGH', reason, blocking: true },
  };
}

describe('SanctionsBadge integration with blockedMatches', () => {
  describe('vessel page context', () => {
    it('shows SANCTIONS BLOCKED when vessel is in blockedMatches with sanctions', () => {
      const blockedMatches: BlockedMatch[] = [makeBlockedMatch('vessel-iran-001')];
      const sanctionsBlock = blockedMatches.find(
        (b) => b.vesselEmailId === 'vessel-iran-001' && b.sanctions?.blocking,
      );

      render(
        <div>
          {sanctionsBlock && <SanctionsBadge reason={sanctionsBlock.filterReason} />}
          <p>Vessel details here</p>
        </div>,
      );

      expect(screen.getByText(/SANCTIONS BLOCKED/i)).toBeInTheDocument();
      expect(screen.getByText(/IR-flagged vessel/i)).toBeInTheDocument();
    });

    it('does NOT show badge when vessel is not in blockedMatches', () => {
      const blockedMatches: BlockedMatch[] = [makeBlockedMatch('vessel-other-999')];
      const sanctionsBlock = blockedMatches.find(
        (b) => b.vesselEmailId === 'vessel-clean-001' && b.sanctions?.blocking,
      );

      render(
        <div>
          {sanctionsBlock && <SanctionsBadge reason={sanctionsBlock.filterReason} />}
          <p>Vessel details here</p>
        </div>,
      );

      expect(screen.queryByText(/SANCTIONS BLOCKED/i)).not.toBeInTheDocument();
    });

    // Class 1 (empty): blockedMatches=[] → no badge
    it('does NOT show badge when blockedMatches is empty', () => {
      const blockedMatches: BlockedMatch[] = [];
      const sanctionsBlock = blockedMatches.find(
        (b) => b.vesselEmailId === 'vessel-001' && b.sanctions?.blocking,
      );

      render(
        <div>
          {sanctionsBlock && <SanctionsBadge reason={sanctionsBlock.filterReason} />}
          <p>Vessel details here</p>
        </div>,
      );

      expect(screen.queryByText(/SANCTIONS BLOCKED/i)).not.toBeInTheDocument();
    });
  });

  describe('cargo page context', () => {
    it('shows SANCTIONS BLOCKED when cargo has a vessel blocked by sanctions', () => {
      const blockedMatches: BlockedMatch[] = [
        {
          cargoEmailId: 'cargo-iran-001',
          cargoItemIndex: 0,
          vesselEmailId: 'vessel-ir-001',
          vesselItemIndex: 0,
          filterReason: 'IR-flagged vessel — OFAC/EU sanctions apply',
          sanctions: { risk: 'HIGH', reason: 'IR-flagged vessel — OFAC/EU sanctions apply', blocking: true },
        },
      ];
      const sanctionsBlocks = blockedMatches.filter(
        (b) => b.cargoEmailId === 'cargo-iran-001' && b.sanctions?.blocking,
      );

      render(
        <div>
          {sanctionsBlocks.length > 0 && (
            <SanctionsBadge reason={sanctionsBlocks[0].filterReason} />
          )}
          <p>Cargo details here</p>
        </div>,
      );

      expect(screen.getByText(/SANCTIONS BLOCKED/i)).toBeInTheDocument();
    });

    // Class 1 (empty): no sanctions blocks for this cargo
    it('does NOT show badge for cargo with no sanctions blocks', () => {
      const blockedMatches: BlockedMatch[] = [];
      const sanctionsBlocks = blockedMatches.filter(
        (b) => b.cargoEmailId === 'cargo-clean-001' && b.sanctions?.blocking,
      );

      render(
        <div>
          {sanctionsBlocks.length > 0 && (
            <SanctionsBadge reason={sanctionsBlocks[0].filterReason} />
          )}
          <p>Cargo details here</p>
        </div>,
      );

      expect(screen.queryByText(/SANCTIONS BLOCKED/i)).not.toBeInTheDocument();
    });
  });
});
