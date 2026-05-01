/**
 * @jest-environment jsdom
 *
 * β-11: ApprovePlanModal — RTL coverage for 4-state UX.
 *
 * Assert-budget: ≤ 30 expects.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApprovePlanModal } from '../ApprovePlanModal';
import type { Plan, ExecutionResult } from '@/lib/agent/plan-types';

function makePlan(): Plan {
  return {
    planId: 'plan-1',
    goal: 'Send prequote to charterer X',
    estimated_actions: 1,
    createdAt: '2026-04-30T00:00:00.000Z',
    steps: [
      {
        id: 'step-email',
        kind: 'send-email',
        description: 'Send email to charterer X',
        params: { to: 'a@b.com' },
        editable: true,
        requires_approval: true,
      },
      {
        id: 'step-cii',
        kind: 'check-cii',
        description: 'Check CII rating',
        params: {},
        editable: false,
        requires_approval: false,
      },
    ],
  };
}

function mockFetchOk(): jest.Mock {
  const result: ExecutionResult = {
    planId: 'plan-1',
    completedAt: '2026-04-30T00:00:01.000Z',
    stepResults: [
      { stepId: 'step-email', status: 'success', output: { sent: true } },
      { stepId: 'step-cii', status: 'skipped' },
    ],
  };
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => result,
  });
}

describe('β-11 ApprovePlanModal — view state', () => {
  it('renders goal, estimated actions, and steps with default approval matching requires_approval', () => {
    render(
      <ApprovePlanModal
        plan={makePlan()}
        onReject={jest.fn()}
        onComplete={jest.fn()}
        fetcher={mockFetchOk()}
      />,
    );
    const emailCheckbox = screen.getByLabelText(/Approve send-email/i) as HTMLInputElement;
    const ciiCheckbox = screen.getByLabelText(/Approve check-cii/i) as HTMLInputElement;
    const snapshot = {
      goalShown: !!screen.getByTestId('plan-goal').textContent?.includes('charterer X'),
      estimatedShown: !!screen
        .getByTestId('estimated-actions')
        .textContent?.includes('1'),
      emailDefaultUnchecked: emailCheckbox.checked === false,
      ciiDefaultChecked: ciiCheckbox.checked === true,
      approveBtnDisabled: (
        screen.getByTestId('approve-btn') as HTMLButtonElement
      ).disabled === false,
    };
    expect(snapshot).toEqual({
      goalShown: true,
      estimatedShown: true,
      emailDefaultUnchecked: true,
      ciiDefaultChecked: true,
      approveBtnDisabled: true,
    });
  });
});

describe('β-11 ApprovePlanModal — reject', () => {
  it('clicking reject calls onReject and skips fetch', () => {
    const onReject = jest.fn();
    const fetcher = mockFetchOk();
    render(
      <ApprovePlanModal
        plan={makePlan()}
        onReject={onReject}
        onComplete={jest.fn()}
        fetcher={fetcher}
      />,
    );
    fireEvent.click(screen.getByTestId('reject-btn'));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('β-11 ApprovePlanModal — edit step', () => {
  it('shows JSON validation error and recovers on valid JSON', () => {
    render(
      <ApprovePlanModal
        plan={makePlan()}
        onReject={jest.fn()}
        onComplete={jest.fn()}
        fetcher={mockFetchOk()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Edit send-email/i));
    const ta = screen.getByLabelText(/Edit params for send-email/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'not-json' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByTestId('param-error-step-email')).toBeInTheDocument();
    fireEvent.change(ta, { target: { value: '{"to":"new@b.com"}' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.queryByTestId('param-error-step-email')).toBeNull();
  });
});

describe('β-11 ApprovePlanModal — approve & execute', () => {
  it('approves email step → POSTs to /api/agent/execute → fires onComplete with result', async () => {
    const onComplete = jest.fn();
    const fetcher = mockFetchOk();
    render(
      <ApprovePlanModal
        plan={makePlan()}
        onReject={jest.fn()}
        onComplete={onComplete}
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Approve send-email/i));
    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-btn'));
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const fetchCall = fetcher.mock.calls[0];
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    const snapshot = {
      url: fetchCall[0],
      method: (fetchCall[1] as RequestInit).method,
      planIdSent: body.planId,
      approvedIds: body.approvedStepIds.sort(),
      onCompleteResultPlanId: onComplete.mock.calls[0][0].planId,
    };
    expect(snapshot).toEqual({
      url: '/api/agent/execute',
      method: 'POST',
      planIdSent: 'plan-1',
      approvedIds: ['step-cii', 'step-email'],
      onCompleteResultPlanId: 'plan-1',
    });
  });

  it('shows error message when execute API fails', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'planId_mismatch' }),
    });
    render(
      <ApprovePlanModal
        plan={makePlan()}
        onReject={jest.fn()}
        onComplete={jest.fn()}
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-btn'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('execute-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('execute-error').textContent).toMatch(/planId_mismatch/);
  });
});
