import { sanitizeEmailBody, formatDate, formatNumber } from '@/lib/utils';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getMatchBySlug } from '@/lib/matching/matches-repository';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { cfValue } from '@/lib/types';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { ClickableField } from '@/components/clickable-field';
import { safeRender, getConf, ConfIcon } from '@/lib/ui-render';
import { renderSpecialRequirements, formatQuantity } from '@/lib/cargo-render';
import { resolveLaycanDisplay } from '@/lib/utils/laycan-display';
import { SanctionsBadge } from '@/components/vessel/SanctionsBadge';
import { Anchor, FileText, Ship } from 'lucide-react';
import { toMatchSlug } from '@/lib/matching/match-slug';
import { isDemoMode } from '@/lib/demo-mode';

interface Props {
  params: Promise<{ id: string }>;
}

// Mirrors CargoClient.tsx COMMOD map — drives CommodityBadge label + colors
const COMMOD: Record<string, { bg: string; text: string; label: string }> = {
  hss:     { bg: '#fef3c7', text: '#92400e', label: 'HSS' },
  grain:   { bg: '#ecfccb', text: '#3f6212', label: 'GR' },
  coal:    { bg: '#1e293b', text: '#cbd5e1', label: 'CL' },
  clinker: { bg: '#e2e8f0', text: '#334155', label: 'CK' },
  sugar:   { bg: '#fce7f3', text: '#831843', label: 'SG' },
  bulk:    { bg: '#e2e8f0', text: '#334155', label: 'BK' },
};

function getCommodityKey(desc: string | null): string {
  const d = (desc ?? '').toLowerCase();
  if (/steel|hss|hot.?roll|metal/.test(d)) return 'hss';
  if (/grain|wheat|corn|maize|barley|soy|oat/.test(d)) return 'grain';
  if (/coal|coke|anthracite/.test(d)) return 'coal';
  if (/clinker|cement/.test(d)) return 'clinker';
  if (/sugar|sucrose/.test(d)) return 'sugar';
  return 'bulk';
}

function fmtWeight(mt: number | null): string | null {
  if (mt === null) return null;
  if (mt >= 1000) return `${Math.round(mt / 1000)}k`;
  return String(mt);
}

export default async function CargoDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) {
    if (isDemoMode()) redirect(`/api/demo/rehydrate?next=/cargo/${id}`);
    redirect('/');
  }

  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();

  const cargos = session.parsedCargos.filter(c => c.emailId === id);
  const matchingVessels = session.matches.filter(m => m.cargoEmailId === id);
  const hasMatch = matchingVessels.length > 0;

  // Resolve the DB match id (migration 049) for each cargo item so the quote worker
  // targets the right item of a multi-item email instead of always falling back to
  // item 0, and injects the economics block (#W1-3).
  const db = getStore().getDatabase();
  function matchIdForItem(itemIndex: number): string | undefined {
    const m = matchingVessels.find(mv => mv.cargoItemIndex === itemIndex);
    if (!m) return undefined;
    const stored = getMatchBySlug(db, m.cargoEmailId, m.vesselEmailId, sessionId!);
    return stored ? String(stored.id) : undefined;
  }

  const sanctionsBlock = (session.blockedMatches ?? []).find(
    (b) => b.cargoEmailId === id && b.sanctions?.blocking,
  );

  const sourceName = email.fromName ?? email.from.split('<')[0].trim();
  const emailMeta = {
    emailBody: email.body || email.snippet,
    emailDate: email.date,
    emailSubject: email.subject,
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'cargo' }} />
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Back link — mirrors side panel close button style */}
        <Link
          href="/cargo"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[13px] text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"
        >
          ← Back to Cargo
        </Link>

        {/* Sanctions blocked badge */}
        {sanctionsBlock && (
          <SanctionsBadge reason={sanctionsBlock.filterReason} />
        )}

        {/* Empty state */}
        {cargos.length === 0 && (
          <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-8 text-center">
            <p className="text-[#64748b] mb-4">No AI analysis available for this cargo inquiry.</p>
            <Link
              href="/cargo"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[13px] text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"
            >
              ← Back to Cargo
            </Link>
          </div>
        )}

        {/* One card per cargo item — mirrors side panel structure */}
        {cargos.map((cargo, idx) => {
          const descVal = cfValue(cargo.cargoDescription);
          const ck = getCommodityKey(descVal);
          const s = COMMOD[ck] ?? COMMOD.bulk;
          const weightMt = cfValue(cargo.weightMt);
          const quantityStr = fmtWeight(weightMt) ?? formatQuantity(cargo.quantity);
          // (#665) Same readiness-rebased cascade as /cargo list and /match/[id].
          const laycanDisplay = resolveLaycanDisplay({
            cargoRaw: cargo.laycan,
            refYear: new Date().getUTCFullYear(),
          });

          return (
            <div key={idx} className="rounded-[12px] border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
              {/* Panel header bar */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f3f7]">
                <h3 className="text-[15px] font-semibold text-[#0f172a]">
                  Cargo detail{cargos.length > 1 ? ` — Item ${idx + 1}` : ''}
                </h3>
                <span className="font-mono text-[11px] text-[#94a3b8]">
                  {formatDate(email.date)}
                </span>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* Commodity header — matches side panel icon + name + type */}
                <div className="flex items-center gap-3">
                  <span
                    className="flex-none w-[30px] h-[30px] rounded-[8px] grid place-items-center font-mono text-[11px] font-semibold tracking-wide select-none"
                    style={{ background: s.bg, color: s.text, border: '1px solid rgba(15,23,42,0.06)' }}
                  >
                    {s.label}
                  </span>
                  <div>
                    <div className="text-[15px] font-semibold text-[#0f172a]">
                      {safeRender(descVal ?? cargo.cargoType)}
                    </div>
                    <div className="font-mono text-[11.5px] text-[#64748b] mt-0.5">
                      {cargo.cargoType}
                    </div>
                  </div>
                </div>

                {/* Primary fields — same dl grid as side panel */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {cargo.originPort && (
                    <>
                      <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Origin</dt>
                      <dd className="text-[13.5px] text-[#0f172a]">
                        {cfValue(cargo.originPort)}{cargo.originCountry ? `, ${cargo.originCountry}` : ''}
                      </dd>
                    </>
                  )}
                  {cargo.destinationPort && (
                    <>
                      <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Destination</dt>
                      <dd className="text-[13.5px] text-[#0f172a]">
                        {cfValue(cargo.destinationPort)}{cargo.destinationCountry ? `, ${cargo.destinationCountry}` : ''}
                      </dd>
                    </>
                  )}
                  {quantityStr && (
                    <>
                      <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Quantity</dt>
                      <dd className="font-mono text-[13.5px] text-[#0f172a]">{quantityStr}</dd>
                    </>
                  )}
                  {laycanDisplay && (
                    <>
                      <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Laycan</dt>
                      <dd className="font-mono text-[13.5px] text-[#0f172a]">{laycanDisplay}</dd>
                    </>
                  )}
                  <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Status</dt>
                  <dd>
                    {hasMatch ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-medium tracking-wider uppercase bg-[#ecfdf5] text-[#166534] border border-[#d1fae5] whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                        Match
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-medium tracking-wider uppercase bg-[#fef3c7] text-[#92400e] border border-[#fde68a] whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                        Open
                      </span>
                    )}
                  </dd>
                  <dt className="font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]">Source</dt>
                  <dd className="text-[13.5px] text-[#64748b]">
                    <span className="font-mono text-[11px] text-[#94a3b8] px-1.5 py-0.5 rounded-full bg-[#f1f5f9] border border-[#e2e8f0] mr-1.5">
                      Email
                    </span>
                    <span className="text-[#0f172a]">{sourceName}</span>
                  </dd>
                </dl>

                {/* Extended AI confidence fields */}
                {(cargo.weightMt || cargo.preferredDates || cargo.loadingRate || cargo.dischargeRate || cargo.commissionPercent != null || cargo.specialRequirements || cargo.incoterms) && (
                  <div className="pt-3 border-t border-[#f1f3f7] space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {cargo.originPort && (
                        <ClickableField
                          label="Origin"
                          value={cargo.originPort.value + (cargo.originCountry ? `, ${cargo.originCountry}` : '')}
                          confidence={cargo.originPort.confidence}
                          sourceText={cargo.originPort.sourceText}
                          {...emailMeta}
                        />
                      )}
                      {cargo.destinationPort && (
                        <ClickableField
                          label="Destination"
                          value={cargo.destinationPort.value + (cargo.destinationCountry ? `, ${cargo.destinationCountry}` : '')}
                          confidence={cargo.destinationPort.confidence}
                          sourceText={cargo.destinationPort.sourceText}
                          {...emailMeta}
                        />
                      )}
                      {cargo.weightMt && (
                        <ClickableField
                          label="Weight"
                          value={cargo.weightMt.value}
                          unit="MT"
                          confidence={cargo.weightMt.confidence}
                          sourceText={cargo.weightMt.sourceText}
                          {...emailMeta}
                        />
                      )}
                      {cargo.preferredDates && (
                        <ClickableField
                          label="Dates"
                          value={cargo.preferredDates.value}
                          confidence={cargo.preferredDates.confidence}
                          sourceText={cargo.preferredDates.sourceText}
                          {...emailMeta}
                        />
                      )}
                      {cargo.loadingRate && (
                        <div className="flex items-center gap-2 text-sm">
                          <Anchor className="h-4 w-4 text-[#94a3b8]" />
                          <span className="font-medium text-[#0f172a]">Loading:</span>
                          <span className="text-[#334155]">{safeRender(cargo.loadingRate)}</span>
                          <ConfIcon confidence={getConf(cargo.loadingRate)} />
                        </div>
                      )}
                      {cargo.dischargeRate && (
                        <div className="flex items-center gap-2 text-sm">
                          <Anchor className="h-4 w-4 text-[#94a3b8]" />
                          <span className="font-medium text-[#0f172a]">Discharge:</span>
                          <span className="text-[#334155]">{safeRender(cargo.dischargeRate)}</span>
                          <ConfIcon confidence={getConf(cargo.dischargeRate)} />
                        </div>
                      )}
                      {cargo.commissionPercent != null && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-[#0f172a]">Commission:</span>
                          <span className="text-[#334155]">
                            {safeRender(cargo.commissionPercent)}%{' '}
                            {safeRender(cargo.commissionTerms) || 'TTL'}
                          </span>
                        </div>
                      )}
                      {cargo.specialRequirements && (
                        <div className="flex items-center gap-2 text-sm">
                          <Ship className="h-4 w-4 text-[#94a3b8]" />
                          <span className="font-medium text-[#0f172a]">Special:</span>
                          <span className="text-[#334155]">
                            {renderSpecialRequirements(cargo.specialRequirements)}
                          </span>
                          <ConfIcon confidence={getConf(cargo.specialRequirements)} />
                        </div>
                      )}
                      {cargo.incoterms && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-[#94a3b8]" />
                          <span className="font-medium text-[#0f172a]">Terms:</span>
                          <span className="text-[#334155]">{safeRender(cargo.incoterms)}</span>
                          <ConfIcon confidence={getConf(cargo.incoterms)} />
                        </div>
                      )}
                    </div>

                    {cargo.missingInfo && cargo.missingInfo.length > 0 && (
                      <div className="mt-3 rounded-[8px] bg-[#fffbeb] border border-[#fde68a] p-3">
                        <p className="text-[12.5px] font-medium text-[#92400e]">Not found or unclear:</p>
                        <ul className="mt-1 list-disc list-inside text-[12.5px] text-[#b45309]">
                          {cargo.missingInfo.map((item, i) => (
                            <li key={i}>{safeRender(item)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Draft quote — per item so the worker targets THIS cargo item (#W1-3) */}
                <div className="pt-3 border-t border-[#f1f3f7]">
                  <DraftQuoteCard emailId={id} matchId={matchIdForItem(idx)} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Original Email — expandable section, collapsed by default */}
        <details className="rounded-[12px] border border-[#e2e8f0] overflow-hidden bg-white">
          <summary className="flex items-center gap-2 px-5 py-4 cursor-pointer select-none text-[13.5px] font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-colors list-none">
            <span>Original Email</span>
            <a
              href={`/email/${id}#highlight`}
              className="ml-auto text-[12px] text-[#6366f1] hover:underline"
            >
              View annotated →
            </a>
          </summary>
          <div className="px-5 pb-5 border-t border-[#f1f3f7]">
            <pre className="text-[13px] whitespace-pre-wrap font-mono text-[#334155] overflow-x-auto pt-4">
              {sanitizeEmailBody(safeRender(email.body || email.snippet))}
            </pre>
          </div>
        </details>

        {/* Matching Vessels */}
        {matchingVessels.length > 0 && (
          <div className="rounded-[12px] border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[#f1f3f7]">
              <h3 className="text-[15px] font-semibold text-[#0f172a]">Matching Vessels</h3>
            </div>
            <div className="px-5 py-4 space-y-2">
              {matchingVessels.map((match, i) => {
                const vessel = session.parsedVessels.find(
                  v => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex
                );
                const levelLabel =
                  match.matchLevel === 'good' ? 'Good match' :
                  match.matchLevel === 'possible' ? 'Possible' : 'Weak';
                const vesselName = vessel ? safeRender(vessel.vesselName) || 'Unknown' : 'Vessel';
                const dwtRaw = vessel ? cfValue(vessel.dwtSummer) : null;
                const dwtStr = dwtRaw != null ? formatNumber(Number(dwtRaw)) : '?';
                return (
                  <Link key={i} href={`/match/${toMatchSlug(match.cargoEmailId, match.vesselEmailId)}`}>
                    <div className="p-3 rounded-[8px] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors cursor-pointer">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[13.5px] font-medium text-[#0f172a]">{vesselName}</p>
                          <p className="font-mono text-[11.5px] text-[#64748b]">
                            {vessel ? `${dwtStr} DWT` : ''}{match.matchReasons[0] ? ` · ${match.matchReasons[0]}` : ''}
                          </p>
                        </div>
                        <span className="font-mono text-[10.5px] text-[#64748b] px-2 py-0.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] whitespace-nowrap">
                          {levelLabel}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
