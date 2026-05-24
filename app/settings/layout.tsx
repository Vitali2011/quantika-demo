import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getAuthConfig } from '@/lib/auth/config';

const SECTIONS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'password',      label: 'Password' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'integrations',  label: 'Integrations' },
  { id: 'team',          label: 'Team' },
  { id: 'api',           label: 'API' },
  { id: 'billing',       label: 'Billing' },
  { id: 'payment',       label: 'Payment' },
  { id: 'invoices',      label: 'Invoices' },
  { id: 'export',        label: 'Export data' },
  { id: 'danger',        label: 'Danger zone', danger: true },
] as const;

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const authConfig = getAuthConfig();
  if (authConfig.enabled && authConfig.secret) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!cookieValue) redirect('/login');
    const payload = await verifyAuthCookie(cookieValue, authConfig.secret).catch(() => null);
    if (!payload) redirect('/login');
  }

  return (
    <div className="min-h-screen bg-ds-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-ds-text mb-6">Settings</h1>
        <div className="flex gap-6">
          {/* Sidebar */}
          <nav
            aria-label="Settings sections"
            className="w-48 shrink-0"
          >
            <ul className="space-y-0.5">
              {SECTIONS.map(({ id, label, danger }) => (
                <li key={id}>
                  <Link
                    href={`/settings/${id}`}
                    className={[
                      'block rounded-ds-sm px-3 py-2 text-sm transition-colors duration-ds-fast outline-none',
                      'focus-visible:ring-2 focus-visible:ring-ds-accent/40',
                      danger
                        ? 'text-ds-danger hover:bg-red-50'
                        : 'text-ds-text-muted hover:bg-ds-surface-muted hover:text-ds-text',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <main
            id="main-content"
            className="flex-1 min-w-0 bg-ds-surface border border-ds-border rounded-ds-md p-6"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
