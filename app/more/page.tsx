import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'More — Quantika',
};

export default function MorePage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">More</h1>
        <p className="mb-6 text-sm text-muted-foreground">Quantika Demo</p>

        <form method="POST" action="/api/auth/logout">
          <button
            type="submit"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            aria-label="Log out of Quantika"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
