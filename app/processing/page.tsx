import { ProgressProcessing } from '@/components/progress-processing';

export default function ProcessingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h2 className="text-xl font-semibold">Analyzing your inbox...</h2>
        <p className="text-sm text-muted-foreground">This takes 20–40 seconds</p>
        <ProgressProcessing />
      </div>
    </main>
  );
}
