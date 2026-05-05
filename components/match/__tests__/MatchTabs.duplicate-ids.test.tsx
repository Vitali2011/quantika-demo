/**
 * @jest-environment jsdom
 */
/**
 * Adversarial QA: MatchTabs duplicate DOM IDs
 * Attack: Two MatchTabs instances on same page — do ARIA IDs remain unique?
 *
 * MatchTabs uses static id templates:
 *   id={`match-tab-${tab.id}`}      → "match-tab-vessels" etc.
 *   id={`match-panel-${activeTab}`} → "match-panel-vessels" etc.
 *
 * If two instances are rendered simultaneously, document.getElementById()
 * returns only the FIRST match — breaking ARIA for the second instance.
 *
 * NOTE: In the current app, MatchTabs is only used once per page route
 * (app/match/[id]/page.tsx). So this is a MEDIUM (pre-existing footgun for
 * future reuse), not an immediately exploitable bug.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MatchTabs } from '../MatchTabs';
import type { Match } from '@/lib/types';

// Mock AuditTrail to avoid real fetch calls
jest.mock('@/components/audit-trail', () => ({
  default: ({ inquiryId }: { inquiryId: string }) => (
    <div data-testid="audit-trail" data-inquiry-id={inquiryId}>Audit Trail</div>
  ),
}));

const baseMatch: Match = {
  cargoEmailId: 'cargo-email-1',
  cargoItemIndex: 0,
  vesselEmailId: 'vessel-email-1',
  vesselItemIndex: 0,
  score: 85,
  matchLevel: 'good',
  matchReasons: ['DWT matches cargo'],
  issues: [],
};

const secondMatch: Match = {
  cargoEmailId: 'cargo-email-2',
  cargoItemIndex: 0,
  vesselEmailId: 'vessel-email-2',
  vesselItemIndex: 0,
  score: 70,
  matchLevel: 'possible',
  matchReasons: ['Port matches'],
  issues: [],
};

describe('MatchTabs duplicate DOM IDs — Attack A', () => {
  it('single instance: tabpanel aria-labelledby resolves to a tab in the same instance', () => {
    const { container } = render(<MatchTabs match={baseMatch} />);
    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel).not.toBeNull();

    const labelledBy = panel!.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const resolvedTab = document.getElementById(labelledBy!);
    expect(resolvedTab).not.toBeNull();
    expect(resolvedTab!.getAttribute('role')).toBe('tab');
  });

  it('BUG PROBE: two instances — all tab IDs are globally unique', () => {
    // When two MatchTabs render on the same page, both generate:
    //   id="match-tab-vessels", id="match-tab-economics", etc.
    // The second instance's IDs collide with the first.
    const { container } = render(
      <div>
        <MatchTabs match={baseMatch} />
        <MatchTabs match={secondMatch} />
      </div>
    );

    // Collect all button ids
    const tabButtons = container.querySelectorAll('[role="tab"][id]');
    const ids = Array.from(tabButtons).map(el => el.getAttribute('id')!);

    // Check for duplicates
    const uniqueIds = new Set(ids);

    // This FAILS if MatchTabs uses static (non-unique) IDs
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('BUG PROBE: two instances — second instance tabpanel aria-labelledby resolves to a tab WITHIN the second instance', () => {
    const { container } = render(
      <div>
        <MatchTabs match={baseMatch} />
        <MatchTabs match={secondMatch} />
      </div>
    );

    // Get both tabpanels
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels.length).toBe(2);

    const secondPanel = panels[1];
    const labelledBy = secondPanel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    // document.getElementById returns FIRST match — with duplicate IDs,
    // this resolves to the FIRST instance's tab, not the second's
    const resolvedTab = document.getElementById(labelledBy!);
    expect(resolvedTab).not.toBeNull();

    // Verify the resolved tab is WITHIN the same container as the second panel
    // (not inside the first MatchTabs instance)
    const wrapper = container.firstElementChild!;
    const firstInstance = wrapper.children[0];
    const secondInstance = wrapper.children[1];
    const isInSecondInstance = secondInstance.contains(resolvedTab);

    // This FAILS when IDs collide — resolved tab lands in first instance
    expect(isInSecondInstance).toBe(true);
  });

  it('BUG PROBE: two instances — active tab in each instance is correctly identified', () => {
    const { container } = render(
      <div>
        <MatchTabs match={baseMatch} />
        <MatchTabs match={secondMatch} />
      </div>
    );

    const allTabLists = container.querySelectorAll('[role="tablist"]');
    expect(allTabLists.length).toBe(2);

    // Each tablist should have exactly one selected tab
    allTabLists.forEach((tablist, i) => {
      const selectedTabs = tablist.querySelectorAll('[aria-selected="true"]');
      expect(selectedTabs.length).toBe(1);

      const selectedTab = selectedTabs[0];
      const controls = selectedTab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();

      // With colliding IDs, getElementById returns the FIRST instance's panel
      const resolvedPanel = document.getElementById(controls!);
      expect(resolvedPanel).not.toBeNull();

      // Check it points to a panel WITHIN the correct instance
      // MatchTabs root div carries .rounded-lg; closest('div') would grab the inner flex wrapper.
      const instance = allTabLists[i].closest('.rounded-lg');
      const isCorrectInstance = instance?.contains(resolvedPanel) ?? false;
      // This FAILS for instance index 1 when IDs collide
      expect(isCorrectInstance).toBe(true);
    });
  });
});
