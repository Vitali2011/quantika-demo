/**
 * Insert: BIMCO standard clauses (canned text).
 * Spec β-13. 4 clauses: war, sanctions, cyber, bio-fouling.
 *
 * Texts are short non-binding paraphrases of BIMCO publications, used as
 * ready-to-paste boilerplate inside operator quotes. They are NOT the
 * official BIMCO wording — brokers must verify against the latest version.
 */
import type { InsertResult } from './index';

export type BimcoClauseId = 'war' | 'sanctions' | 'cyber' | 'bio';

interface ClauseDef {
  title: string;
  body: string;
}

const CLAUSES: Record<BimcoClauseId, ClauseDef> = {
  war: {
    title: 'BIMCO War Risks Clause (CONWARTIME 2013)',
    body:
      'Owners shall not be obliged to proceed to or through any place where, in the ' +
      'reasonable judgement of the Master and/or Owners, the Vessel, cargo or crew ' +
      'may be exposed to War Risks. Any premiums and additional crew costs arising ' +
      'from War Risks shall be for Charterers’ account.',
  },
  sanctions: {
    title: 'BIMCO Sanctions Clause for Time Charter Parties 2020',
    body:
      'Charterers warrant that the performance of this charter will not expose the ' +
      'Vessel, Owners, Managers, crew, insurers, or financiers to any Sanctions. If ' +
      'sanctions are imposed during the charter, Owners may refuse to perform any ' +
      'voyage that would breach applicable Sanctions law.',
  },
  cyber: {
    title: 'BIMCO Cyber Security Clause 2019',
    body:
      'Each Party shall implement appropriate Cyber Security measures and procedures ' +
      'to protect their respective Digital Environments. Liability for losses caused ' +
      'by a Cyber Security Incident is capped at USD 100,000 unless caused by gross ' +
      'negligence or wilful misconduct.',
  },
  bio: {
    title: 'BIMCO Hull Fouling Clause for Time Charter Parties 2019',
    body:
      'If the Vessel remains at or shifts between berths, anchorages or zones in the ' +
      'same port for an aggregate period exceeding the Threshold Period, any resulting ' +
      'hull fouling and associated costs of inspection, cleaning and re-treatment ' +
      'shall be for Charterers’ account.',
  },
};

// BUG-β-13-AttrXSS: TS union does not guard the runtime trust boundary —
// callers in the extension UI / RPC layer pass strings. Validate explicitly.
const ALLOWED_CLAUSE_IDS: ReadonlySet<BimcoClauseId> = new Set([
  'war',
  'sanctions',
  'cyber',
  'bio',
]);

export function buildBimcoInsert(clauseId: BimcoClauseId): InsertResult {
  if (!ALLOWED_CLAUSE_IDS.has(clauseId)) {
    throw new Error(`buildBimcoInsert: unknown clauseId: ${String(clauseId)}`);
  }
  const c = CLAUSES[clauseId];

  const html =
    `<div data-bimco-clause="${clauseId}">` +
    `<p><strong>${esc(c.title)}</strong></p>` +
    `<p>${esc(c.body)}</p>` +
    `</div>`;

  const plain = `${c.title}\n\n${c.body}`;

  return { html, plain };
}

function esc(s: string): string {
  // BUG-β-13-AttrXSS: extend escape to cover " and ' for attribute contexts.
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
