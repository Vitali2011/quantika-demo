import Link from 'next/link';

export interface Charterer {
  id: string;
  name: string;
  tier: 'blue-chip' | 'second' | 'weak';
  require_lc: number;
  notes: string | null;
  email?: string | null;
  created_at?: string;
}

type ContactStatus = 'hot' | 'warm' | 'cold';

function tierToStatus(tier: string): ContactStatus {
  if (tier === 'blue-chip') return 'hot';
  if (tier === 'second') return 'warm';
  return 'cold';
}

function nameInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

const AV_PALETTE = ['amber', 'indigo', 'teal', 'navy', 'rose', 'slate', 'olive', 'stone'] as const;

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) { h = ((h << 5) - h) + id.charCodeAt(i); h |= 0; }
  return AV_PALETTE[Math.abs(h) % AV_PALETTE.length];
}

const AV_STYLES: Record<string, string> = {
  amber:  'background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#422006',
  indigo: 'background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff',
  teal:   'background:linear-gradient(135deg,#14b8a6,#0d9488);color:#fff',
  navy:   'background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff',
  rose:   'background:linear-gradient(135deg,#fb7185,#e11d48);color:#fff',
  slate:  'background:linear-gradient(135deg,#475569,#334155);color:#fff',
  olive:  'background:linear-gradient(135deg,#84cc16,#65a30d);color:#1a2e05',
  stone:  'background:linear-gradient(135deg,#78716c,#57534e);color:#fff',
};

interface Props {
  charterers: Charterer[];
}

const TH_STYLE: React.CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 10.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ds-text-subtle)',
  fontWeight: 500,
  padding: '14px 16px',
  borderBottom: '1px solid var(--ds-border)',
  background: 'var(--ds-surface-muted)',
  whiteSpace: 'nowrap',
};

const HEADERS: { label: string; align: 'left' | 'right' }[] = [
  { label: 'Name',               align: 'left'  },
  { label: 'Email',              align: 'left'  },
  { label: 'Last Contact',       align: 'right' },
  { label: 'Last Email Snippet', align: 'left'  },
  { label: 'Status',             align: 'left'  },
];

export function CharterersTable({ charterers }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        role="grid"
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontSize: 14,
        }}
      >
        <colgroup>
          <col style={{ width: 220 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 200 }} />
          <col style={{ width: 90 }} />
        </colgroup>
        <thead>
          <tr>
            {HEADERS.map(({ label, align }) => (
              <th key={label} style={{ ...TH_STYLE, textAlign: align }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {charterers.length === 0 ? (
            <tr>
              <td
                colSpan={HEADERS.length}
                style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ds-text-muted)', fontSize: 14 }}
              >
                No charterers found. Add one to get started.
              </td>
            </tr>
          ) : charterers.map((c) => {
            const status = tierToStatus(c.tier);
            const rowBg =
              status === 'hot' ? 'var(--ds-accent-soft)' :
              status === 'cold' ? 'var(--ds-bg)' :
              'var(--ds-surface)';
            const avColor = avatarColor(c.id);
            return (
              <tr
                key={c.id}
                data-status={status}
                style={{
                  background: rowBg,
                  transition: 'background .12s ease',
                  cursor: 'pointer',
                }}
              >
                {/* Name cell */}
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-border)', verticalAlign: 'middle' }}>
                  <Link
                    href={`/charterers/${c.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', minWidth: 0 }}
                  >
                    <div
                      style={{
                        width: 30, height: 30,
                        borderRadius: 999,
                        flexShrink: 0,
                        display: 'grid', placeItems: 'center',
                        fontSize: 12, fontWeight: 500,
                        border: '1px solid rgba(15,23,42,0.08)',
                        ...(Object.fromEntries(
                          AV_STYLES[avColor].split(';').map(s => {
                            const [k, ...v] = s.split(':');
                            return [k?.trim().replace(/-([a-z])/g, (_,l) => l.toUpperCase()), v.join(':').trim()];
                          }).filter(([k]) => k)
                        ) as React.CSSProperties),
                      }}
                      aria-hidden
                    >
                      {nameInitial(c.name)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.005em', color: 'var(--ds-text)', lineHeight: 1.2 }}>
                        {c.name}
                      </span>
                      <span style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: 11, color: 'var(--ds-text-muted)' }}>
                        {c.tier}
                      </span>
                    </div>
                  </Link>
                </td>

                {/* Email */}
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-border)', verticalAlign: 'middle', fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: 13, color: 'var(--ds-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.email ?? <span style={{ color: 'var(--ds-text-subtle)' }}>—</span>}
                </td>

                {/* LC Required */}
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-border)', verticalAlign: 'middle', textAlign: 'right', fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: 13 }}>
                  {c.require_lc ? (
                    <span style={{ color: 'var(--ds-danger)', fontWeight: 600 }}>Yes</span>
                  ) : (
                    <span style={{ color: 'var(--ds-success)' }}>No</span>
                  )}
                </td>

                {/* Last note snippet */}
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-border)', verticalAlign: 'middle', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.notes ? (
                    <span style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--ds-text-muted)', letterSpacing: '-0.003em' }}>
                      &ldquo;{c.notes}&hellip;&rdquo;
                    </span>
                  ) : (
                    <span style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: 13, color: 'var(--ds-text-subtle)' }}>—</span>
                  )}
                </td>

                {/* Status pill */}
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-border)', verticalAlign: 'middle' }}>
                  <StatusPill status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: ContactStatus }) {
  const styles: Record<ContactStatus, { bg: string; color: string; border: string; dot: string }> = {
    hot:  { bg: 'var(--ds-accent-soft)',   color: 'var(--ds-accent-soft-fg)', border: '#fde68a',              dot: '#f59e0b' },
    warm: { bg: 'var(--ds-success-soft)',  color: '#166534',                   border: 'var(--ds-success-soft)', dot: '#16a34a' },
    cold: { bg: '#f1f5f9',                 color: '#475569',                   border: '#e2e8f0',              dot: '#94a3b8' },
  };
  const s = styles[status];
  const label = status === 'hot' ? 'Hot' : status === 'warm' ? 'Warm' : 'Cold';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 9px 3px 8px',
        borderRadius: 999,
        fontFamily: '"Geist Mono", ui-monospace, monospace',
        fontSize: 10.5, fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0 }} aria-hidden />
      {label}
    </span>
  );
}
