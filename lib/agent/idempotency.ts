/**
 * β-11: In-memory idempotency cache for executePlan.
 *
 * Key = `${planId}:${stepId}` (or just `${planId}` for full plan results).
 * TTL = 24h. Process-local Map — sufficient for single-instance demo.
 * On repeated POST /api/agent/execute с тем же planId сервер возвращает
 * cached ExecutionResult, не запуская side-effects повторно.
 */

import type { ExecutionResult, StepResult } from './plan-types';

export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const planCache = new Map<string, CacheEntry<ExecutionResult>>();
const stepCache = new Map<string, CacheEntry<StepResult>>();

function now(): number {
  return Date.now();
}

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > now();
}

function planKey(planId: string): string {
  return `plan:${planId}`;
}

function stepKey(planId: string, stepId: string): string {
  return `step:${planId}:${stepId}`;
}

export function getCachedExecution(planId: string): ExecutionResult | null {
  const entry = planCache.get(planKey(planId));
  if (isFresh(entry)) return entry.value;
  if (entry) planCache.delete(planKey(planId));
  return null;
}

export function cacheExecution(
  planId: string,
  result: ExecutionResult,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  planCache.set(planKey(planId), { value: result, expiresAt: now() + ttlMs });
}

export function getCachedStep(planId: string, stepId: string): StepResult | null {
  const entry = stepCache.get(stepKey(planId, stepId));
  if (isFresh(entry)) return entry.value;
  if (entry) stepCache.delete(stepKey(planId, stepId));
  return null;
}

export function cacheStep(
  planId: string,
  result: StepResult,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  stepCache.set(stepKey(planId, result.stepId), {
    value: result,
    expiresAt: now() + ttlMs,
  });
}

/** Test helper. */
export function _resetIdempotencyCache(): void {
  planCache.clear();
  stepCache.clear();
}
