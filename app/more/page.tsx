import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'More — Quantika',
};

export default function MorePage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col p-6">
      <div className="w-full max-w-sm mx-auto rounded-xl border border-border bg-card p-8 shadow-sm space-y-6">
        <div>
          <h1 className="mb-1 text-xl font-semibold">More</h1>
          <p className="text-sm text-muted-foreground">Quantika Demo</p>
        </div>

        <nav aria-label="More navigation">
          <ul className="space-y-1">
            <li>
              <Link
                href="/upgrade"
                className="flex items-center justify-between w-full rounded-lg px-4 py-3 text-sm font-medium text-foreground hover:bg-muted min-h-[44px]"
              >
                Upgrade to Pro
                <span className="text-muted-foreground text-xs">→</span>
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="flex items-center justify-between w-full rounded-lg px-4 py-3 text-sm font-medium text-foreground hover:bg-muted min-h-[44px]"
              >
                Dashboard
                <span className="text-muted-foreground text-xs">→</span>
              </Link>
            </li>
            <li>
              <span className="flex items-center justify-between w-full rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground min-h-[44px]">
                Help &amp; FAQ
                <span className="text-xs">Coming soon</span>
              </span>
            </li>
          </ul>
        </nav>

        <form method="POST" action="/api/auth/logout">
          <button
            type="submit"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted min-h-[44px]"
            aria-label="Log out of Quantika"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
