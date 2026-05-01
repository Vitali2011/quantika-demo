'use client';

/**
 * β-11: ApprovePlanModal — UX foundation for plan-first / execute-second.
 *
 * 4-state UX:
 *  - View   (read-only list of steps)
 *  - Edit   (inline JSON editor for editable step params)
 *  - Reject (close without execute)
 *  - Approve (POST /api/agent/execute с approved step ids)
 *
 * Reusable by β-12 (gmail scoring), β-15 (auto-prequote-engine).
 */

import React from 'react';
import type { Plan, PlanStep, ExecutionResult } from '@/lib/agent/plan-types';

export interface ApprovePlanModalProps {
  plan: Plan;
  onReject: () => void;
  onComplete: (result: ExecutionResult) => void;
  /** Override fetch (tests). */
  fetcher?: typeof fetch;
}

type Phase = 'view' | 'executing' | 'done' | 'error';

export function ApprovePlanModal({
  plan,
  onReject,
  onComplete,
  fetcher,
}: ApprovePlanModalProps) {
  const fetchFn = fetcher ?? fetch;

  const [approvedIds, setApprovedIds] = React.useState<Set<string>>(
    () => new Set(plan.steps.filter((s) => !s.requires_approval).map((s) => s.id)),
  );
  const [editing, setEditing] = React.useState<string | null>(null);
  const [paramDrafts, setParamDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(plan.steps.map((s) => [s.id, JSON.stringify(s.params, null, 2)])),
  );
  const [paramErrors, setParamErrors] = React.useState<Record<string, string>>({});
  const [phase, setPhase] = React.useState<Phase>('view');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function toggleApproval(id: string): void {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(id: string): void {
    setEditing(id);
  }

  function saveEdit(step: PlanStep): void {
    const draft = paramDrafts[step.id] ?? '{}';
    try {
      const parsed = JSON.parse(draft);
      step.params = parsed;
      setParamErrors((e) => {
        const next = { ...e };
        delete next[step.id];
        return next;
      });
      setEditing(null);
    } catch (err) {
      setParamErrors((e) => ({
        ...e,
        [step.id]: err instanceof Error ? err.message : 'invalid JSON',
      }));
    }
  }

  async function handleApprove(): Promise<void> {
    setPhase('executing');
    setErrorMsg(null);
    try {
      const res = await fetchFn('/api/agent/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId: plan.planId,
          plan,
          approvedStepIds: Array.from(approvedIds),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const result: ExecutionResult = await res.json();
      setPhase('done');
      onComplete(result);
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'execute_failed');
    }
  }

  return (
    <div role="dialog" aria-label="Approve plan" data-testid="approve-plan-modal">
      <header>
        <h2>Review plan</h2>
        <p data-testid="plan-goal">{plan.goal}</p>
        <p data-testid="estimated-actions">
          Estimated actions: {plan.estimated_actions}
        </p>
      </header>

      <ul data-testid="plan-steps">
        {plan.steps.map((step) => (
          <li key={step.id} data-testid={`step-${step.id}`}>
            <label>
              <input
                type="checkbox"
                checked={approvedIds.has(step.id)}
                onChange={() => toggleApproval(step.id)}
                aria-label={`Approve ${step.kind}`}
              />
              <span>
                <strong>{step.kind}</strong> — {step.description}
              </span>
            </label>
            {step.editable &&
              (editing === step.id ? (
                <div>
                  <textarea
                    aria-label={`Edit params for ${step.kind}`}
                    value={paramDrafts[step.id] ?? ''}
                    onChange={(e) =>
                      setParamDrafts((d) => ({ ...d, [step.id]: e.target.value }))
                    }
                  />
                  {paramErrors[step.id] && (
                    <p role="alert" data-testid={`param-error-${step.id}`}>
                      {paramErrors[step.id]}
                    </p>
                  )}
                  <button type="button" onClick={() => saveEdit(step)}>
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(step.id)}
                  aria-label={`Edit ${step.kind}`}
                >
                  Edit
                </button>
              ))}
          </li>
        ))}
      </ul>

      {phase === 'executing' && (
        <p role="status" data-testid="executing-indicator">
          Executing…
        </p>
      )}
      {phase === 'error' && errorMsg && (
        <p role="alert" data-testid="execute-error">
          {errorMsg}
        </p>
      )}

      <footer>
        <button
          type="button"
          onClick={onReject}
          disabled={phase === 'executing'}
          data-testid="reject-btn"
        >
          Reject all
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={phase === 'executing' || approvedIds.size === 0}
          data-testid="approve-btn"
        >
          Approve & Execute ({approvedIds.size})
        </button>
      </footer>
    </div>
  );
}
