'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';

type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped';

interface Step {
  label: string;
  endpoint: string;
  critical?: boolean; // if true, stop pipeline on failure
}

interface StepGroup {
  steps: Step[];
  parallel?: boolean;
}

const STEP_GROUPS: StepGroup[] = [
  { steps: [{ label: 'Loading emails from Gmail...', endpoint: '/api/emails/fetch', critical: true }] },
  { steps: [{ label: 'Sorting your inbox by type...', endpoint: '/api/ai/classify', critical: true }] },
  { steps: [
    { label: 'Reading your cargo inquiries...', endpoint: '/api/ai/parse-cargo' },
    { label: 'Extracting vessel details...', endpoint: '/api/ai/parse-vessel' },
    { label: 'Extracting fixture recaps...', endpoint: '/api/ai/parse-recap' },
  ], parallel: true },
  { steps: [{ label: 'Finding available vessels for your cargo...', endpoint: '/api/ai/match' }] },
  { steps: [
    { label: 'Summarizing your negotiations...', endpoint: '/api/ai/recap' },
    { label: 'Mapping your network...', endpoint: '/api/ai/counterparty' },
  ], parallel: true },
];

// Flatten for display
const STEPS: Step[] = STEP_GROUPS.flatMap(g => g.steps);

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
  const [statuses, setStatuses] = useState<StepStatus[]>(STEPS.map(() => 'pending'));
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [subjectIndex, setSubjectIndex] = useState(0);

  const doneCount = statuses.filter(s => s === 'done' || s === 'skipped').length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

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

        const runStep = async (step: Step, idx: number) => {
          try {
            const res = await fetch(step.endpoint, { method: 'POST' });
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
            const msg = err instanceof Error ? err.message : 'Unknown error';
            console.warn(`Step ${idx + 1} (${step.label}) failed: ${msg}`);
            return { ok: false, step, idx, msg };
          }
        };

        if (group.parallel) {
          const results = await Promise.all(
            group.steps.map((step, i) => runStep(step, flatIdx + i))
          );
          for (const r of results) {
            if (!r.ok) {
              if (r.step.critical) {
                setStatuses(prev => { const next = [...prev]; next[r.idx] = 'error'; return next; });
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
              if (r.step.critical) {
                setStatuses(prev => { const next = [...prev]; next[r.idx] = 'error'; return next; });
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
          {STEPS.map((step, i) => (
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
