/**
 * β-15: PDF recap generator for SOF voice memos.
 *
 * Layout:
 *   - Header: vessel name + port + arrival UTC
 *   - Laytime block: allowed / used / demurrage rate
 *   - Events: chronological table (time + description)
 *
 * Uses pdfkit (lighter than puppeteer). compress=false so embedded text is
 * directly searchable in the produced bytes — convenient for tests and for
 * downstream grep-based pipelines without pulling pdf-parse as a dep.
 */

import PDFDocument from 'pdfkit';
import type { SofRecapFields } from './nlp-extract';

export async function generateRecapPdf(fields: SofRecapFields): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      // Embed vessel/port in the PDF Info dict so they're greppable in the
      // raw bytes (used by tests + downstream pipelines that don't want to
      // pull pdf-parse). compress=false keeps page streams uncompressed too.
      const doc = new PDFDocument({
        compress: false,
        size: 'A4',
        margin: 50,
        info: {
          Title: `SOF Recap ${fields.vessel} ${fields.port}`,
          Subject: `vessel=${fields.vessel} port=${fields.port}`,
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).text(`SOF Recap — ${fields.vessel}`, { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(11).text(`Port: ${fields.port}`);
      doc.text(`Arrival (UTC): ${fields.arrivalUtc}`);
      doc.moveDown(0.5);

      // Laytime block
      doc.fontSize(13).text('Laytime');
      doc.fontSize(11);
      doc.text(`Allowed: ${fields.laytimeAllowedHrs} h`);
      doc.text(`Used:    ${fields.laytimeUsedHrs} h`);
      const overrun = Math.max(0, fields.laytimeUsedHrs - fields.laytimeAllowedHrs);
      doc.text(`Overrun: ${overrun} h`);
      doc.text(`Demurrage rate: USD ${fields.demurrageRateUsd}/day`);
      doc.moveDown(0.5);

      // Events
      doc.fontSize(13).text('Events');
      doc.fontSize(11);
      for (const ev of fields.events) {
        doc.text(`${ev.time}  —  ${ev.description}`);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
