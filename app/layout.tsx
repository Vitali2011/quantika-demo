import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { getTrialState, daysRemaining, isExpired } from '@/lib/trial';
import { TrialBanner } from '@/components/onboarding/TrialBanner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Quantika Demo — AI for Freight Email',
  description: 'See how AI handles your freight email in 2 minutes',
};

async function TrialBannerWrapper() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    if (!sessionId) return null;

    const trial = await getTrialState(sessionId);
    if (!trial) return null;

    const expired = isExpired(trial);
    const days = daysRemaining(trial);
    // eslint-disable-next-line react-hooks/error-boundaries -- session/trial lookup may throw; banner is best-effort decoration, not critical render path
    return <TrialBanner daysRemaining={days} expired={expired} />;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The UI chrome is English; per-content RTL handling lives next to the
  // content (EmailBodyViewer derives dir from the body via detectTextDirection).
  // Browser Accept-Language used to leak ru/de/he into <html> and broke
  // mixed-locale demo scenarios — see stab/rtl-per-content.
  return (
    <html lang="en" dir="ltr">
      <body className={inter.className}>
        <TrialBannerWrapper />
        {children}
      </body>
    </html>
  );
}
