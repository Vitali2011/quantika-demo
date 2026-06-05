import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — Quantika',
  description: 'Quantika — AI-powered freight intelligence for dry bulk shipping',
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-ds-accent transition-colors">
            ← Home
          </Link>
        </div>

        <header className="space-y-3">
          <h1 className="text-3xl font-bold text-slate-900">About Quantika</h1>
          <p className="text-lg text-slate-600">
            AI-powered freight intelligence for dry bulk shipping.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">What we do</h2>
          <p className="text-slate-600 leading-relaxed">
            Quantika helps freight traders and chartering teams cut through the noise of daily email traffic.
            Our platform automatically parses cargo inquiries, vessel positions, and fixture recaps —
            then surfaces the best vessel-cargo matches ranked by compatibility score, route economics, and laycan fit.
          </p>
          <p className="text-slate-600 leading-relaxed">
            Instead of manually cross-referencing dozens of emails, your team sees a ranked shortlist of
            actionable opportunities within seconds of an email arriving.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Key capabilities</h2>
          <ul className="space-y-3">
            {[
              { icon: '📧', title: 'Email parsing', desc: 'Extracts cargo specs, vessel details, and laycan windows from plain-text emails using LLMs trained on shipping industry language.' },
              { icon: '🤝', title: 'Smart matching', desc: 'Scores vessel-cargo pairs on DWT compatibility, route fit, laycan overlap, and TCE economics — ranked by overall match quality.' },
              { icon: '📊', title: 'Market intelligence', desc: 'Baltic Exchange indices (BDI, BCI, BSI, BHSI), TCE estimates for major tradelanes, and bunker price feeds.' },
              { icon: '🔒', title: 'Compliance checks', desc: 'Automatic OFAC and EU sanctions screening on all counterparties before a fixture goes firm.' },
            ].map(({ icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="text-xl flex-shrink-0">{icon}</span>
                <div>
                  <span className="font-medium text-slate-900">{title} — </span>
                  <span className="text-slate-600">{desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Who we serve</h2>
          <p className="text-slate-600 leading-relaxed">
            Quantika is built for dry bulk chartering desks, commodity traders, and shipowners managing
            Supramax, Capesize, and Handysize fleets across the Mediterranean, Black Sea, and West African corridors.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Get in touch</h2>
          <p className="text-slate-600 text-sm">
            Interested in a live demo or a pilot for your team?
          </p>
          <a
            href="mailto:hello@quantika.org"
            className="inline-block px-5 py-2.5 bg-ds-accent text-ds-accent-fg text-sm font-medium rounded-lg hover:bg-ds-accent/90 transition-colors"
          >
            Contact us
          </a>
        </section>

        <nav className="flex gap-4 text-sm">
          <Link href="/pricing" className="text-ds-accent hover:underline">Pricing →</Link>
          <Link href="/market" className="text-slate-500 hover:text-ds-accent transition-colors">Market data →</Link>
        </nav>
      </div>
    </main>
  );
}
