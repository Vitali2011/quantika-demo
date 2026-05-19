import { cookies } from 'next/headers';
import { getSession } from '@/lib/session';
import { EmailUploadCTA } from '@/components/onboarding/EmailUploadCTA';
import { LandingPageClient } from '@/components/LandingPageClient';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;

  if (!sessionId || !getSession(sessionId)) {
    return <EmailUploadCTA />;
  }

  return <LandingPageClient />;
}
