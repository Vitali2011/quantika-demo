import Link from 'next/link';
import { LiveStrip } from '@/components/market/LiveStrip';

const FEATURES = [
  {
    icon: '📧',
    title: 'Email parsing',
    desc: 'Extracts cargo, vessel, and fixture data from broker emails automatically',
  },
  {
    icon: '🔗',
    title: 'Smart matching',
    desc: 'Finds vessel-cargo combinations with freight rate and laycan alignment',
  },
  {
    icon: '📊',
    title: 'Market context',
    desc: 'BDI, bunker prices, and route benchmarks alongside every match',
  },
];

const TRUST_LOGOS = ['Norden', 'Glencore', 'Cargill', 'Bunge'];

export function PublicLanding() {
  return (
    <main className="min-h-screen bg-ds-bg">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-20 pb-10 text-center space-y-4">
        <h1 className="text-4xl font-bold text-ds-text leading-tight">
          Parses broker emails,<br />builds your matches for you
        </h1>
        <p className="text-lg text-ds-text-muted">
          AI-powered freight intelligence for bulk shipping
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/api/auth/google"
            prefetch={false}
            className="inline-block px-8 py-3 bg-ds-accent text-ds-accent-fg font-semibold rounded-ds-lg hover:bg-ds-accent/90 transition-colors text-sm"
          >
            Connect Gmail →
          </Link>
          <Link href="/login" className="inline-block px-8 py-3 bg-ds-surface border border-ds-border text-ds-text font-medium rounded-ds-lg hover:bg-ds-surface-muted transition-colors text-sm">View demo →</Link>
        </div>
      </section>

      {/* Live market strip */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <p className="text-xs font-semibold text-ds-text-subtle uppercase tracking-widest mb-3">
          Live market
        </p>
        <LiveStrip />
      </section>

      {/* Feature cards */}
      <section className="max-w-3xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 space-y-2"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="font-semibold text-ds-text text-sm">{f.title}</h3>
              <p className="text-xs text-ds-text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust logos */}
      <section className="max-w-3xl mx-auto px-4 pb-20 text-center space-y-3">
        <p className="text-xs font-semibold text-ds-text-subtle uppercase tracking-widest">
          Trusted by teams at
        </p>
        <div className="flex items-center justify-center gap-8 flex-wrap">
          {TRUST_LOGOS.map((name) => (
            <span key={name} className="text-sm font-semibold text-ds-text-muted">
              {name}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
