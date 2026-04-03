'use client';

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

const STEPS = [
  { label: 'Loading emails from Gmail...', endpoint: '/api/emails/fetch' },
  { label: 'Classifying messages...', endpoint: '/api/ai/classify' },
  { label: 'Parsing rate requests...', endpoint: '/api/ai/parse-request' },
  { label: 'Building negotiation recaps...', endpoint: '/api/ai/recap' },
];

type StepStatus = 'pending' | 'loading' | 'done' | 'error';

export function ProgressProcessing() {
  const [statuses, setStatuses] = useState<StepStatus[]>(STEPS.map(() => 'pending'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function runPipeline() {
      for (let i = 0; i < STEPS.length; i++) {
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'loading' : s));
        try {
          const res = await fetch(STEPS[i].endpoint, { method: 'POST' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Step ${i + 1} failed`);
          }
          setStatuses(prev => prev.map((s, idx) => idx === i ? 'done' : s));
        } catch (err) {
          setStatuses(prev => prev.map((s, idx) => idx === i ? 'error' : s));
          setError(err instanceof Error ? err.message : 'Processing failed');
          return;
        }
      }
      window.location.href = '/dashboard';
    }
    runPipeline();
  }, []);

  const doneCount = statuses.filter(s => s === 'done').length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2">Analyzing your inbox... {progress}%</p>
        <Progress value={progress} className="h-2" />
      </div>
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const status = statuses[i];
          return (
            <div key={i} className="flex items-center gap-3">
              {status === 'done' && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
              {status === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0" />}
              {status === 'pending' && <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
              {status === 'error' && <Circle className="h-5 w-5 text-red-500 shrink-0" />}
              <span className={`text-sm ${status === 'done' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}. <a href="/" className="underline">Try again</a>
        </div>
      )}
    </div>
  );
}
