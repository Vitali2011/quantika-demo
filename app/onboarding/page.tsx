import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTrialState, startTrial } from '@/lib/trial';
import { seedDemoForRegion } from '@/lib/onboarding/demo-seed';
import { createSession } from '@/lib/session';
import { Button } from '@/design-system/primitives';

type Region = 'MENA' | 'Med' | 'WAFR';
const VALID_REGIONS: Region[] = ['MENA', 'Med', 'WAFR'];

async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('session_id')?.value ?? null;
}

async function handleStart(formData: FormData) {
  'use server';
  const region = formData.get('region') as string;
  if (!VALID_REGIONS.includes(region as Region)) return;

  const cookieStore = await cookies();
  let sessionId = cookieStore.get('session_id')?.value;

  if (!sessionId) {
    sessionId = createSession('onboarding-guest');
    cookieStore.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    });
  }

  await startTrial(sessionId, region as Region);
  await seedDemoForRegion(sessionId, region as Region);
  redirect('/');
}

export default async function OnboardingPage() {
  const sessionId = await getSessionId();
  if (sessionId) {
    const trial = await getTrialState(sessionId);
    if (trial?.demo_seeded) {
      redirect('/');
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ds-bg">
      {/* Connect Gmail demo banner */}
      <div className="w-full max-w-md mb-6 px-4">
        <div className="flex items-center gap-3 rounded-ds-md bg-ds-accent-soft border border-ds-accent/20 px-4 py-3 text-sm">
          <span aria-hidden="true">📧</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-ds-accent">Connect Gmail to see real matches</p>
            <p className="text-ds-text-muted text-xs mt-0.5">1 OAuth click — takes 30 seconds</p>
          </div>
          <a
            href="/api/auth/gmail"
            className="shrink-0 inline-flex items-center gap-1 rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-fg hover:bg-ds-accent/90 transition-colors duration-ds-fast focus-visible:ring-2 focus-visible:ring-ds-accent/40 outline-none"
          >
            Connect
          </a>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md text-center space-y-6 px-4 pb-8">
        <div className="space-y-1">
          <div className="text-4xl mb-3">⚓</div>
          <h1 className="text-3xl font-bold text-ds-text">Welcome to Quantika</h1>
          <p className="text-ds-text-muted">
            5 minutes to your first quote — guaranteed.
          </p>
        </div>

        {/* Mode auto-detect hint */}
        <p className="text-xs text-ds-text-muted bg-ds-surface border border-ds-border rounded-ds-md px-3 py-2">
          We&apos;ll auto-detect your role (charterer / shipowner) from your first real email.
        </p>

        <form action={handleStart} className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ds-text">Choose your region:</legend>
            <div className="flex gap-3 justify-center">
              {VALID_REGIONS.map((r) => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="region"
                    value={r}
                    required
                    className="h-4 w-4 accent-[var(--ds-accent)] focus-visible:ring-2 focus-visible:ring-ds-accent/40"
                  />
                  <span className="text-sm text-ds-text">{r}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" variant="primary" size="lg" className="w-full">
            Start 14-day trial — no credit card
          </Button>
        </form>

        <p className="text-xs text-ds-text-muted">
          Demo data pre-loaded so you see a working product immediately.
        </p>
      </div>
    </main>
  );
}
