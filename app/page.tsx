import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { PublicLanding } from '@/components/PublicLanding';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;

  if (sessionId && getSession(sessionId)) {
    redirect('/dashboard');
  }

  return <PublicLanding />;
}
