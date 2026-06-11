import type { MatchWorksheet as MatchWorksheetType } from '@/lib/types';
import React from 'react';
import { DraftCalcBreakdown } from './DraftCalcBreakdown';
import { getPortMaster } from '@/lib/sailing/port-master';

interface Props {
  worksheet: MatchWorksheetType | null;
}

function dash(val: string | number | boolean | null | undefined): string {
  if (val == null || val === '') return '—';
  return String(val);
}

function verdictBadge(pass: boolean, reason?: string, warning?: boolean): string {
  if (warning) return reason ? `⚠️ ${reason}` : '⚠️ Check';
  const icon = pass ? '✅' : '⚠️';
  return reason ? `${icon} ${reason}` : `${icon} ${pass ? 'OK' : 'Check'}`;
}

function readinessLabel(verdict: string): string {
  switch (verdict) {
    case 'ideal': return '✅ Ideal timing';
    case 'tight': return '⚠️ Tight laycan';
    case 'idle': return '⚠️ Vessel idle pre-laycan';
    case 'late': return '❌ Late arrival';
    default: return '— Unknown';
  }
}

export function MatchWorksheet({ worksheet }: Props) {
  if (!worksheet) return null;

  const { readiness: r, vessel: v, cargo: c, hardFilters: hf } = worksheet;

  const capacityMt = v.dwcc ?? v.dwtSummer;
  const utilWeight = c.weightMtEffective ?? c.weightMt;  // worst-case when present; graceful fallback
  const util =
    capacityMt != null && capacityMt > 0 && utilWeight != null
      ? Math.round((utilWeight / capacityMt) * 100)
      : null;

  const transitChain = (() => {
    const parts: string[] = [];
    if (r.distanceNm != null) parts.push(`${Math.round(r.distanceNm)} nm`);
    if (r.sailingDays != null) {
      const spd = r.speedKn != null ? ` @ ${r.speedKn} kn` : '';
      parts.push(`≈${r.sailingDays.toFixed(1)} d${spd}`);
    }
    if (r.arrivalDate) parts.push(r.arrivalDate);
    return parts.length > 0 ? parts.join(' → ') : '—';
  })();

  const rows: Array<{ label: string; vessel: string; cargoPort: string; verdict: string; detail?: React.ReactNode }> = [
    {
      label: '⏱ Time',
      vessel: [r.openDate ? `free ${r.openDate}` : null, r.openPosition ? `@ ${r.openPosition}` : null].filter(Boolean).join(' ') || '—',
      cargoPort: [r.laycanStart ? `laycan ${r.laycanStart}` : null, r.laycanEnd ? `– ${r.laycanEnd}` : null].filter(Boolean).join(' ') || '—',
      verdict: r.verdict !== 'unknown'
        ? `${readinessLabel(r.verdict)}${r.gapDays != null ? ` (${r.gapDays}d gap)` : ''}`
        : '— Unknown timing',
    },
    {
      label: '📍 Where / Transit',
      vessel: dash(r.openPosition),
      cargoPort: dash(c.loadPort),
      verdict: transitChain,
    },
    {
      label: '⚖️ Weight',
      vessel: v.dwtSummer != null ? `${v.dwtSummer.toLocaleString('en-US')} DWT${v.dwcc != null ? ` / ${v.dwcc.toLocaleString('en-US')} DWCC` : ''}` : '—',
      cargoPort: c.weightMt != null
          ? (c.weightMtEffective != null && c.weightMtEffective !== c.weightMt
              ? `${c.weightMt.toLocaleString('en-US')} mt (${c.weightMtEffective.toLocaleString('en-US')} max w/ option)`
              : `${c.weightMt.toLocaleString('en-US')} mt`)
          : '—',
      verdict: util != null
        ? `${util}% utilisation${util > 100 ? ' ❌' : util >= 85 ? ' ✅' : util >= 70 ? ' ⚠️' : ' ❌'}`
        : verdictBadge(hf.volume.pass, hf.volume.reason),
    },
    {
      label: '📦 Volume',
      vessel: v.grainCapacity != null ? `${v.grainCapacity.toLocaleString('en-US')} ${v.grainCapacityUnit ?? 'cbm'}` : '—',
      cargoPort: '—',
      verdict: verdictBadge(hf.volume.pass, hf.volume.reason),
    },
    {
      label: '🚢 Type',
      vessel: dash(v.vesselType),
      cargoPort: dash(c.cargoType),
      verdict: '—',
    },
    {
      label: '🏗 Cranes',
      vessel: v.geared != null ? (v.geared ? 'Geared ✅' : 'Gearless') : '—',
      cargoPort: hf.crane.reason ? hf.crane.reason : '—',
      // Crane verdict comes entirely from the hard-filter layer (checkCrane),
      // which already encodes founder rule 2026-06-02: gearless + breakbulk at an
      // unverified port → {pass:true, warning:true, reason:'Confirm cranes'} → amber;
      // confirmed cranes → ✅; no cranes → hard ⚠️. A component-level override here
      // collapsed all three into amber, so defer to verdictBadge.
      verdict: verdictBadge(hf.crane.pass, hf.crane.reason, hf.crane.warning),
    },
    {
      label: '🌊 Draft',
      vessel: v.draftMax != null ? `${v.draftMax} m` : '—',
      cargoPort: hf.draft.reason ? hf.draft.reason : '—',
      verdict: verdictBadge(hf.draft.pass, hf.draft.reason),
      detail: (
        <DraftCalcBreakdown
          loadPort={c.loadPort}
          dischargePort={c.dischargePort}
          draftCheck={hf.draft}
          destDraftCheck={hf.destDraft}
          dwtSummer={v.dwtSummer}
          weightMt={c.weightMtEffective ?? c.weightMt}
          statedMaxDraftM={v.draftMax}
          loadPortLimit={getPortMaster(c.loadPort)?.maxDraftM ?? null}
          dischargePortLimit={getPortMaster(c.dischargePort)?.maxDraftM ?? null}
        />
      ),
    },
    {
      label: '🛡 Quality',
      vessel: [
        v.built ? `built ${v.built}` : null,
        v.flag,
        v.pandi ? `P&I: ${v.pandi}` : null,
      ].filter(Boolean).join(' · ') || '—',
      cargoPort: '—',
      verdict: '—',
    },
  ];

  return (
    <div className="bg-ds-surface rounded-xl ring-1 ring-ds-border overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-ds-border">
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-ds-text-muted w-32">
              Parameter
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
              🚢 Vessel
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
              📦 Cargo / Port
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
              Verdict
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <React.Fragment key={row.label}>
              <tr className="border-t border-ds-border hover:bg-ds-bg/50">
                <td className="py-2 px-3 font-medium text-ds-text-muted whitespace-nowrap">{row.label}</td>
                <td className="py-2 px-3 text-ds-text">{row.vessel}</td>
                <td className="py-2 px-3 text-ds-text">{row.cargoPort}</td>
                <td className="py-2 px-3 text-ds-text">{row.verdict}</td>
              </tr>
              {row.detail && (
                <tr className="border-t border-ds-border/40 bg-ds-bg/30">
                  <td colSpan={4} className="px-3 pb-2">
                    {row.detail}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
