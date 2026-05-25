'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PIPELINE_STEPS, STEP_GROUPS, type PipelineStep, type PipelineStepGroup } from '@/lib/pipeline';
import { useToast } from '@/components/ui/toast';

type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped';

const STEP_ERROR_MESSAGES: Record<string, { stepName: string; errorText: string }> = {
  '/api/emails/fetch':    { stepName: 'Loading emails',       errorText: 'Failed to load emails from Gmail' },
  '/api/ai/classify':     { stepName: 'Classifying emails',   errorText: 'Failed to classify emails' },
  '/api/ai/parse-cargo':  { stepName: 'Parsing cargo',        errorText: 'Failed to parse cargo inquiries' },
  '/api/ai/parse-vessel': { stepName: 'Parsing vessels',      errorText: 'Failed to extract vessel details' },
  '/api/ai/parse-recap':  { stepName: 'Parsing recaps',       errorText: 'Failed to extract fixture recaps' },
  '/api/ai/match':        { stepName: 'Matching',             errorText: 'Failed to find vessel-cargo matches' },
  '/api/ai/recap':        { stepName: 'Generating recap',     errorText: 'Failed to summarize negotiations' },
  '/api/ai/counterparty': { stepName: 'Mapping network',      errorText: 'Failed to map counterparty network' },
};


const SAMPLE_SUBJECTS = [
  'RE: Antalya / Georgetown 3000mts bb cgo',
  'MV ALINA - open Casablanca',
  'FW: FIXTURE RECAP - MV EVEREST BAY',
  'RE: Charter - Steel coils JEA→HAM',
  'OPEN CGOS FM UKRAINE',
  'MV Northstar Glory - position',
  'RE: 30,000 MT cement Suez/Nacala',
  'FW: BL + Insurance cert',
];

function stepIcon(status: StepStatus) {
  if (status === 'done') return '✅';
  if (status === 'active') return '⏳';
  if (status === 'error') return '⚠️';
  if (status === 'skipped') return '⏭️';
  return '○';
}

function stepLabelClass(status: StepStatus): string {
  if (status === 'active') return 'font-medium text-ds-text';
  if (status === 'done') return 'text-ds-text-muted';
  if (status === 'error') return 'text-ds-danger';
  if (status === 'skipped') return 'text-ds-warn';
  return 'text-ds-text-subtle';
}

const PARSE_CARGO_IDX = PIPELINE_STEPS.findIndex(s => s.endpoint === '/api/ai/parse-cargo');

export default function ProcessingPage() {
  const router = useRouter();
  const toast = useToast();
  const parsedToastFired = useRef(false);
  const [statuses, setStatuses] = useState<StepStatus[]>(PIPELINE_STEPS.map(() => 'pending'));
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [subjectIndex, setSubjectIndex] = useState(0);

  const doneCount = statuses.filter(s => s === 'done' || s === 'skipped').length;
  const progress = Math.round((doneCount / PIPELINE_STEPS.length) * 100);
  const isActive = statuses.some(s => s === 'active');

  useEffect(() => {
    const interval = setInterval(() => {
      setSubjectIndex(prev => (prev + 1) % SAMPLE_SUBJECTS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (
      PARSE_CARGO_IDX >= 0 &&
      statuses[PARSE_CARGO_IDX] === 'done' &&
      !parsedToastFired.current
    ) {
      parsedToastFired.current = true;
      toast.info('Emails parsed — matching vessels...');
    }
  }, [statuses, toast]);

  useEffect(() => {
    let cancelled = false;

    async function runPipeline() {
      let flatIdx = 0;

      for (const group of STEP_GROUPS) {
        if (cancelled) return;

        const groupIndices = group.steps.map((_, i) => flatIdx + i);

        setStatuses(prev => {
          const next = [...prev];
          groupIndices.forEach(idx => { next[idx] = 'active'; });
          return next;
        });

        const runStep = async (step: PipelineStep, idx: number) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), step.timeoutMs ?? 90_000);
          try {
            const csrfToken = document.cookie
              .split('; ')
              .find(r => r.startsWith('csrf_token='))
              ?.split('=')[1] ?? '';
            const res = await fetch(step.endpoint, {
              method: 'POST',
              signal: controller.signal,
              headers: { 'X-CSRF-Token': csrfToken },
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body?.error ?? `Step failed (${res.status})`);
            }
            if (!cancelled) {
              setStatuses(prev => {
                const next = [...prev];
                next[idx] = 'done';
                return next;
              });
            }
            return { ok: true, step, idx };
          } catch (err: unknown) {
            clearTimeout(timeoutId);
            const isTimeout = err instanceof Error && err.name === 'AbortError';
            const msg = isTimeout
              ? 'Сервис временно недоступен, попробуйте позже'
              : err instanceof Error ? err.message : 'Unknown error';
            return { ok: false, step, idx, msg };
          }
        };

        if (group.parallel) {
          const results = await Promise.all(
            group.steps.map((step, i) => runStep(step, flatIdx + i))
          );
          for (const r of results) {
            if (!r.ok) {
              track('processing_failed', { step: r.step.endpoint });
              if (r.step.critical) {
                setStatuses(prev => { const next = [...prev]; next[r.idx] = 'error'; return next; });
                setFailedStep(r.step.endpoint);
                setFatalError(r.msg || 'Unknown error');
                return;
              }
              setStatuses(prev => { const next = [...prev]; next[r.idx] = 'skipped'; return next; });
            }
          }
        } else {
          for (let i = 0; i < group.steps.length; i++) {
            const r = await runStep(group.steps[i], flatIdx + i);
            if (!r.ok) {
              track('processing_failed', { step: r.step.endpoint });
              if (r.step.critical) {
                setStatuses(prev => { const next = [...prev]; next[r.idx] = 'error'; return next; });
                setFailedStep(r.step.endpoint);
                setFatalError(r.msg || 'Unknown error');
                return;
              }
              setStatuses(prev => { const next = [...prev]; next[r.idx] = 'skipped'; return next; });
            }
          }
        }

        flatIdx += group.steps.length;
      }

      if (!cancelled) {
        track('processing_complete');
        router.push('/dashboard');
      }
    }

    runPipeline();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 bg-ds-bg">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ds-text">Analyzing your inbox...</h2>
          <p className="text-sm text-ds-text-muted">This takes 30–60 seconds</p>
        </div>

        {(isActive || (progress === 0 && !fatalError)) && (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="animate-spin h-10 w-10 text-ds-accent"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="w-full text-sm font-medium text-ds-text" role="status">
              Analysing your freight quote…
            </p>
          </div>
        )}

        {/* Progress bar — DS token variant replacing shadcn Progress */}
        <div className="space-y-1">
          <div className="w-full bg-ds-border rounded-ds-full h-2 overflow-hidden">
            <div
              className="h-2 bg-ds-accent rounded-ds-full transition-all duration-ds-slow"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-xs text-ds-text-muted">{progress}%</p>
        </div>

        <ul className="text-left space-y-2" aria-label="Processing steps" aria-live="polite">
          {PIPELINE_STEPS.map((step, i) => (
            <li
              key={step.endpoint}
              className="flex items-center gap-3 text-sm rounded focus:ring-2 focus:ring-offset-2 outline-none"
              tabIndex={0}
              aria-label={`${step.label} — ${statuses[i]}`}
              aria-current={statuses[i] === 'active' ? 'step' : undefined}
            >
              <span className="w-5 text-center shrink-0" aria-hidden="true">{stepIcon(statuses[i])}</span>
              <span className={stepLabelClass(statuses[i])}>
                {statuses[i] === 'done' ? step.label.replace('...', ' ✓') :
                 statuses[i] === 'skipped' ? step.label.replace('...', ' (skipped)') :
                 step.label}
              </span>
            </li>
          ))}
        </ul>

        {progress > 0 && progress < 100 && !fatalError && (
          <div className="mt-4 text-center">
            <div className="text-xs text-ds-text-muted mb-1">Currently processing:</div>
            <div className="text-sm font-medium text-ds-text-subtle transition-all duration-500 truncate max-w-sm mx-auto">
              —— {SAMPLE_SUBJECTS[subjectIndex]} ——
            </div>
          </div>
        )}

        {fatalError && (
          <div className="mt-4 rounded-ds-md border border-ds-danger/50 bg-ds-danger-soft p-3 text-sm text-ds-danger">
            <p className="font-medium">Something went wrong</p>
            {failedStep && STEP_ERROR_MESSAGES[failedStep] ? (
              <p className="mt-1 font-medium">
                {STEP_ERROR_MESSAGES[failedStep].stepName}: {STEP_ERROR_MESSAGES[failedStep].errorText}
              </p>
            ) : null}
            <p className="mt-1 text-xs">{fatalError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
