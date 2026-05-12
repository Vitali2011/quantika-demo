/**
 * @jest-environment jsdom
 */
// Regression Lock: QA adversarial 2026-05-12
// Class: A (Empty/falsy) | Severity: MEDIUM
// Finding: A-02 — empty subsDeadline string should show error
// Spec: gamma-08-subs-timer-v2
// DO NOT DELETE — see references/regression_lock_workflow.md


import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';

describe('regression gamma-08-A-02: empty subsDeadline handling', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalEnv;
  });

  it('empty string subsDeadline should show Invalid deadline', () => {
    const { container } = render(
      <SubsCountdownWidget dealId="test" subsDeadline="" />
    );

    // Expected: "Invalid deadline" message
    // Current implementation: new Date("") creates Invalid Date → isNaN check → shows "Invalid deadline"
    expect(container.textContent).toMatch(/invalid/i);
    // This should PASS — verifying current behavior is correct
  });

  it('whitespace-only subsDeadline should show Invalid deadline', () => {
    const { container } = render(
      <SubsCountdownWidget dealId="test" subsDeadline="   " />
    );

    // new Date("   ") → Invalid Date
    expect(container.textContent).toMatch(/invalid/i);
  });

  it('malformed ISO string should show Invalid deadline', () => {
    const { container } = render(
      <SubsCountdownWidget dealId="test" subsDeadline="not-a-date" />
    );

    expect(container.textContent).toMatch(/invalid/i);
  });

  it('null-like string should show Invalid deadline', () => {
    const { container } = render(
      <SubsCountdownWidget dealId="test" subsDeadline="null" />
    );

    // new Date("null") → Invalid Date
    expect(container.textContent).toMatch(/invalid/i);
  });

  // This test documents expected behavior — should PASS on current code
  // Not a bug, but validates Class A handling is correct
});
