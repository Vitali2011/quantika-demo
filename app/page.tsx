import { cookies } from 'next/headers';
import { EmailUploadCTA } from '@/components/onboarding/EmailUploadCTA';
import { LandingPageClient } from '@/components/LandingPageClient';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;

  if (!sessionId) {
    return <EmailUploadCTA />;
  }

  return <LandingPageClient />;
}
