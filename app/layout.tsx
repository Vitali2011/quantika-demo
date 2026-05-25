import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { getTrialState, daysRemaining, isExpired } from '@/lib/trial';
import { TrialBanner } from '@/components/onboarding/TrialBanner';
import { getAuthConfig } from '@/lib/auth/config';
import { verifyAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getStore } from '@/lib/session-store';
import { ModeProvider, AppShell } from '@/design-system/patterns';
import type { Mode } from '@/design-system/patterns';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// Inline script runs before React hydration to prevent flash on dark-mode first paint.
const THEME_SCRIPT = `(function(){try{var c=document.cookie.match(/quantika_theme=(dark|light)/);var t=c?c[1]:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');document.documentElement.classList.add('dark')}}catch(e){}})()`;

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

async function resolveInitialMode(cookieHeader: string | null): Promise<Mode> {
  try {
    const authConfig = getAuthConfig();
    const secret = authConfig.secret;
    if (!secret) return 'charterer';
    if (!cookieHeader) return 'charterer';

    // Parse cookie header to extract demo_auth value
    const authCookieValue = cookieHeader
      .split(';')
      .map(s => s.trim())
      .find(s => s.startsWith(`${AUTH_COOKIE_NAME}=`))
      ?.slice(AUTH_COOKIE_NAME.length + 1);
    if (!authCookieValue) return 'charterer';

    const payload = await verifyAuthCookie(authCookieValue, secret);
    if (!payload) return 'charterer';

    const db = getStore().getDatabase();
    const row = db
      .prepare<[string], { preferred_mode: Mode }>('SELECT preferred_mode FROM user_preferences WHERE username = ?')
      .get(payload.user);
    if (row?.preferred_mode === 'owner') return 'owner';
  } catch {
    // Non-critical — fall through to default
  }
  return 'charterer';
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const authConfig = getAuthConfig();

  // Check if user is authenticated to decide whether to wrap with AppShell
  let isAuthenticated = !authConfig.enabled; // if auth disabled → demo mode, always show shell
  let username: string | null = null;

  if (authConfig.enabled && authConfig.secret) {
    const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (cookieValue) {
      const payload = await verifyAuthCookie(cookieValue, authConfig.secret).catch(() => null);
      if (payload) {
        isAuthenticated = true;
        username = payload.user;
      }
    }
  } else if (!authConfig.enabled) {
    username = 'demo';
  }

  // The UI chrome is English; per-content RTL handling lives next to the
  // content (EmailBodyViewer derives dir from the body via detectTextDirection).
  // Browser Accept-Language used to leak ru/de/he into <html> and broke
  // mixed-locale demo scenarios — see stab/rtl-per-content.
  if (!isAuthenticated) {
    return (
      <html lang="en" dir="ltr" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
        <body className={inter.className}>
          {children}
        </body>
      </html>
    );
  }

  // Resolve preferred_mode: cookie fast-path first, then DB
  let initialMode: Mode = 'charterer';
  const modeCookie = cookieStore.get('preferred_mode')?.value;
  if (modeCookie === 'owner' || modeCookie === 'charterer') {
    initialMode = modeCookie;
  } else if (username) {
    try {
      const db = getStore().getDatabase();
      const row = db
        .prepare<[string], { preferred_mode: Mode }>('SELECT preferred_mode FROM user_preferences WHERE username = ?')
        .get(username);
      if (row?.preferred_mode === 'owner') initialMode = 'owner';
    } catch {
      // Non-critical — default to charterer
    }
  }

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <Suspense fallback={null}>
          <TrialBannerWrapper />
        </Suspense>
        <ModeProvider initial={initialMode}>
          <AppShell>{children}</AppShell>
        </ModeProvider>
      </body>
    </html>
  );
}
