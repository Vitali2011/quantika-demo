'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { track } from '@/lib/analytics';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PIPELINE_STEPS, STEP_GROUPS, type PipelineStep, type PipelineStepGroup } from '@/lib/pipeline';

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

export default function ProcessingPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<StepStatus[]>(PIPELINE_STEPS.map(() => 'pending'));
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [subjectIndex, setSubjectIndex] = useState(0);

  const doneCount = statuses.filter(s => s === 'done' || s === 'skipped').length;
  const progress = Math.round((doneCount / PIPELINE_STEPS.length) * 100);

  useEffect(() => {
    const interval = setInterval(() => {
      setSubjectIndex(prev => (prev + 1) % SAMPLE_SUBJECTS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function runPipeline() {
      let flatIdx = 0;

      for (const group of STEP_GROUPS) {
        if (cancelled) return;

        const groupIndices = group.steps.map((_, i) => flatIdx + i);

        // Mark all steps in group as active
        setStatuses(prev => {
          const next = [...prev];
          groupIndices.forEach(idx => { next[idx] = 'active'; });
          return next;
        });

        const runStep = async (step: PipelineStep, idx: number) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 90_000);
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
    <main className="flex min-h-screen flex-col items-center justify-center px-6 bg-white">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Analyzing your inbox...</h2>
          <p className="text-sm text-muted-foreground">This takes 30–60 seconds</p>
        </div>

        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">{progress}%</p>
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
              <span className={
                statuses[i] === 'active' ? 'font-medium text-foreground' :
                statuses[i] === 'done' ? 'text-muted-foreground' :
                statuses[i] === 'error' ? 'text-destructive' :
                statuses[i] === 'skipped' ? 'text-yellow-600' :
                'text-muted-foreground/50'
              }>
                {statuses[i] === 'done' ? step.label.replace('...', ' ✓') :
                 statuses[i] === 'skipped' ? step.label.replace('...', ' (skipped)') :
                 step.label}
              </span>
            </li>
          ))}
        </ul>

        {progress > 0 && progress < 100 && !fatalError && (
          <div className="mt-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Currently processing:</div>
            <div className="text-sm font-medium text-foreground/70 transition-all duration-500 truncate max-w-sm mx-auto">
              —— {SAMPLE_SUBJECTS[subjectIndex]} ——
            </div>
          </div>
        )}

        {fatalError && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
