import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import { listMatches } from '@/lib/matching/matches-repository';
import type { MatchStatus, StoredMatch } from '@/lib/matching/matches-repository';
import PDFDocument from 'pdfkit';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];

function isFeatureEnabled(): boolean {
  return process.env.MATCHES_ENABLED === 'true';
}

function formatDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function buildPdf(matches: StoredMatch[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('Quantika — Match Results Export');
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(`Generated: ${new Date().toUTCString()}  ·  Matches: ${matches.length}`);
    doc.moveDown(1);

    if (matches.length === 0) {
      doc.fontSize(11).fillColor('#374151').text('No matches found with the current filters.');
    } else {
      matches.forEach((m, i) => {
        if (doc.y > 730) doc.addPage();

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#1d4ed8')
          .text(`#${i + 1}  Score: ${m.score}%`, { continued: true });
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#6b7280')
          .text(`   [${m.status}]`);

        doc.fontSize(9).fillColor('#111827');
        doc.font('Helvetica-Bold').text('Cargo: ', { continued: true });
        doc.font('Helvetica').text(m.cargo_id);
        doc.font('Helvetica-Bold').text('Vessel: ', { continued: true });
        doc.font('Helvetica').text(m.vessel_id);

        if (m.cargo_type) {
          doc.font('Helvetica-Bold').text('Cargo type: ', { continued: true });
          doc.font('Helvetica').text(m.cargo_type);
        }

        if (m.load_port || m.discharge_port) {
          doc.font('Helvetica-Bold').text('Route: ', { continued: true });
          doc.font('Helvetica').text(`${m.load_port ?? '?'} → ${m.discharge_port ?? '?'}`);
        }

        if (m.laycan_start || m.laycan_end) {
          doc.font('Helvetica-Bold').text('Laycan: ', { continued: true });
          doc.font('Helvetica').text(`${formatDate(m.laycan_start)} – ${formatDate(m.laycan_end)}`);
        }

        if (m.vessel_dwt) {
          doc.font('Helvetica-Bold').text('DWT: ', { continued: true });
          doc.font('Helvetica').text(m.vessel_dwt.toLocaleString());
        }

        if (m.reason) {
          doc.fontSize(8).fillColor('#6b7280').font('Helvetica').text(m.reason, { lineGap: 1 });
        }

        doc.moveDown(0.5);
        if (i < matches.length - 1) {
          doc
            .moveTo(40, doc.y)
            .lineTo(555, doc.y)
            .strokeColor('#e5e7eb')
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.5);
        }
      });
    }

    doc.end();
  });
}

export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 503 });
  }

  const db = getStore().getDatabase();
  const sp = request.nextUrl.searchParams;

  const statusParam = sp.get('status');
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as MatchStatus)
      ? (statusParam as MatchStatus)
      : undefined;

  const cargoTypes = sp.getAll('cargo_type');
  const route = sp.get('route') ?? undefined;

  const parseMs = (raw: string | null): number | undefined => {
    if (!raw) return undefined;
    const t = new Date(raw).getTime();
    return isNaN(t) ? undefined : t;
  };
  const parseNum = (raw: string | null): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw);
    return isNaN(n) ? undefined : n;
  };

  const matches = listMatches(db, {
    user_id: sessionId,
    status,
    sortBy: 'score',
    sortDir: 'desc',
    cargo_type: cargoTypes.length > 0 ? cargoTypes : undefined,
    route,
    laycan_from: parseMs(sp.get('laycan_from')),
    laycan_to: parseMs(sp.get('laycan_to')),
    score_min: parseNum(sp.get('score_min')),
    dwt_min: parseNum(sp.get('dwt_min')),
    dwt_max: parseNum(sp.get('dwt_max')),
  });

  try {
    const pdfBuffer = await buildPdf(matches);
    const filename = `quantika-matches-${new Date().toISOString().slice(0, 10)}.pdf`;
    // TypeScript 6 tightened ArrayBufferView generics; copy into a fresh ArrayBuffer
    // to satisfy BodyInit (which requires ArrayBuffer, not ArrayBufferLike).
    const arrayBuffer = new ArrayBuffer(pdfBuffer.byteLength);
    new Uint8Array(arrayBuffer).set(pdfBuffer);
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch {
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
