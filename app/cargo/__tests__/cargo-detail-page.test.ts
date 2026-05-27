/**
 * @jest-environment node
 *
 * Behavioral tests — /cargo/[id] full detail page visual consistency (#595)
 *
 * Strategy: source analysis (testEnvironment: 'node') — RSC with server APIs
 * cannot be rendered without complex mocking; source analysis verifies the same
 * structural primitives are present in both the side panel and the detail page.
 *
 * Invariants verified:
 *   - Same dl grid CSS classes as CargoClient SidePanel
 *   - CommodityBadge markup matches side panel badge
 *   - Email section uses <details> (collapsed by default — no open attribute)
 *   - Back link targets /cargo (not /dashboard)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const detailPagePath = path.join(ROOT, 'app/cargo/[id]/page.tsx');
const cargoClientPath = path.join(ROOT, 'app/cargo/CargoClient.tsx');

const detailSrc = fs.readFileSync(detailPagePath, 'utf8');
const clientSrc = fs.readFileSync(cargoClientPath, 'utf8');

describe('/cargo/[id] full detail — header structure matches side panel (#595)', () => {
  it('uses dl grid with same classes as CargoClient SidePanel', () => {
    const sidePanelDtClass = 'font-mono text-[10.5px] uppercase tracking-wider text-[#94a3b8]';
    expect(detailSrc).toContain(sidePanelDtClass);
    expect(clientSrc).toContain(sidePanelDtClass);
  });

  it('renders CommodityBadge-equivalent markup (w-[30px] h-[30px] rounded-[8px])', () => {
    const badgeClass = 'w-[30px] h-[30px] rounded-[8px]';
    expect(detailSrc).toContain(badgeClass);
    expect(clientSrc).toContain(badgeClass);
  });

  it('uses same COMMOD commodity key map as CargoClient', () => {
    expect(detailSrc).toContain("hss:");
    expect(detailSrc).toContain("grain:");
    expect(detailSrc).toContain("coal:");
    expect(clientSrc).toContain("hss:");
  });

  it('email section is wrapped in <details> element (collapsed by default)', () => {
    expect(detailSrc).toMatch(/<details /);
    expect(detailSrc).toMatch(/<summary /);
    // No open attribute = collapsed by default
    expect(detailSrc).not.toMatch(/<details[^>]+open/);
  });

  it('Back link points to /cargo, not /dashboard', () => {
    expect(detailSrc).toContain('href="/cargo"');
    expect(detailSrc).toContain('Back to Cargo');
    expect(detailSrc).not.toContain('href="/dashboard"');
  });

  it('primary fields include Status pill with same colors as side panel', () => {
    // Side panel match pill: bg-[#ecfdf5] text-[#166534]
    // Side panel open pill: bg-[#fef3c7] text-[#92400e]
    expect(detailSrc).toContain('bg-[#ecfdf5]');
    expect(detailSrc).toContain('bg-[#fef3c7]');
    expect(clientSrc).toContain('bg-[#ecfdf5]');
    expect(clientSrc).toContain('bg-[#fef3c7]');
  });

  it('Source field renders email tag same as side panel', () => {
    // Side panel source tag: bg-[#f1f5f9] border border-[#e2e8f0]
    const sourceTagClass = 'bg-[#f1f5f9] border border-[#e2e8f0]';
    expect(detailSrc).toContain(sourceTagClass);
    expect(clientSrc).toContain(sourceTagClass);
  });
});
