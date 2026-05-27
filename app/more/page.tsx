import type { Metadata } from 'next';
import Link from 'next/link';
import { DarkToggle } from '@/design-system/patterns';

export const metadata: Metadata = {
  title: 'More — Quantika',
};

export default function MorePage() {
  return (
    <div className="flex min-h-[calc(100vh-56px-env(safe-area-inset-bottom,0px))] flex-col p-6">
      <div className="w-full max-w-sm mx-auto rounded-ds-lg border border-ds-border bg-ds-surface p-8 shadow-sm space-y-6">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-ds-text">More</h1>
          <p className="text-sm text-ds-text-muted">Quantika Demo</p>
        </div>

        <nav aria-label="More navigation">
          <ul className="space-y-1">
            <li>
              <Link
                href="/upgrade"
                className="flex items-center justify-between w-full rounded-ds-md px-4 py-3 text-sm font-medium text-ds-text hover:bg-ds-surface-muted transition-colors duration-ds-fast min-h-[44px]"
              >
                Upgrade to Pro
                <span className="text-ds-text-muted text-xs">→</span>
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="flex items-center justify-between w-full rounded-ds-md px-4 py-3 text-sm font-medium text-ds-text hover:bg-ds-surface-muted transition-colors duration-ds-fast min-h-[44px]"
              >
                Dashboard
                <span className="text-ds-text-muted text-xs">→</span>
              </Link>
            </li>
            <li>
              <span className="flex items-center justify-between w-full rounded-ds-md px-4 py-3 text-sm font-medium text-ds-text min-h-[44px]">
                Appearance
                <DarkToggle />
              </span>
            </li>
            <li>
              <Link
                href="/about"
                className="flex items-center justify-between w-full rounded-ds-md px-4 py-3 text-sm font-medium text-ds-text hover:bg-ds-surface-muted transition-colors duration-ds-fast min-h-[44px]"
              >
                About Quantika
                <span className="text-ds-text-muted text-xs">→</span>
              </Link>
            </li>
            <li>
              <Link
                href="/pricing"
                className="flex items-center justify-between w-full rounded-ds-md px-4 py-3 text-sm font-medium text-ds-text hover:bg-ds-surface-muted transition-colors duration-ds-fast min-h-[44px]"
              >
                Pricing
                <span className="text-ds-text-muted text-xs">→</span>
              </Link>
            </li>
            <li>
              <span className="flex items-center justify-between w-full rounded-ds-md px-4 py-3 text-sm font-medium text-ds-text-muted min-h-[44px]">
                Help &amp; FAQ
                <span className="text-xs">Coming soon</span>
              </span>
            </li>
          </ul>
        </nav>

        <form method="POST" action="/api/auth/logout">
          <button
            type="submit"
            className="w-full rounded-ds-md border border-ds-border bg-ds-surface px-4 py-2.5 text-sm font-medium text-ds-text transition-colors duration-ds-fast hover:bg-ds-surface-muted min-h-[44px]"
            aria-label="Log out of Quantika"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
