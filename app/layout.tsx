import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies, headers } from 'next/headers';
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

/** RTL languages keyed by primary BCP-47 subtag */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

function parseAcceptLanguage(header: string | null): { lang: string; dir: 'ltr' | 'rtl' } {
  if (!header) return { lang: 'en', dir: 'ltr' };
  // Take the first language tag, strip region (e.g. "ar-SA" → "ar")
  const primary = header.split(',')[0]?.split(';')[0]?.trim().split('-')[0]?.toLowerCase() ?? 'en';
  const dir = RTL_LANGS.has(primary) ? 'rtl' : 'ltr';
  return { lang: primary, dir };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const { lang, dir } = parseAcceptLanguage(headersList.get('accept-language'));

  return (
    <html lang={lang} dir={dir}>
      <body className={inter.className}>
        <TrialBannerWrapper />
        {children}
      </body>
    </html>
  );
}
