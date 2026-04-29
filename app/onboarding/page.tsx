import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTrialState, startTrial } from '@/lib/trial';
import { seedDemoForRegion } from '@/lib/onboarding/demo-seed';
import { createSession } from '@/lib/session';

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

  // F6 fix: if no session exists yet (user landed on /onboarding directly,
  // without going through /api/sample), auto-create one and set the cookie.
  // Previously this was a silent `return` that swallowed the redirect.
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center space-y-6 p-8">
        <h1 className="text-3xl font-bold">⚓ Welcome to Quantika</h1>
        <p className="text-lg text-gray-600">
          5 minutes to your first quote — guaranteed.
        </p>

        <form action={handleStart} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700">Choose your region:</legend>
            <div className="flex gap-3 justify-center">
              {VALID_REGIONS.map((r) => (
                <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="region" value={r} required className="accent-blue-600" />
                  <span className="text-sm">{r}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Start 14-day trial — no credit card
          </button>
        </form>
      </div>
    </main>
  );
}
