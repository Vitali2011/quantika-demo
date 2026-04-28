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
    return <TrialBanner daysRemaining={days} expired={expired} />;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* @ts-expect-error Server Component */}
        <TrialBannerWrapper />
        {children}
      </body>
    </html>
  );
}
