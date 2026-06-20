/**
 * CI-gate: port-da ⇄ port-master reconciliation.
 *
 * Every port_code in scripts/seed-data/port-da-base.json MUST be resolvable
 * back to itself by name through resolvePort(). If a DA tariff exists for a
 * port but resolvePort(port_name) returns null or a *different* portCode, then
 * getPortDa() silently returns 0 (wrong/missing port charges) — exactly the
 * regression class this gate prevents.
 *
 * Failure-first: written before the data fix (8 missing ports + Jebel Ali /
 * Port Rashid identity). Red before, green after.
 *
 * See CONTEXT.md (port_da, discharge_port) and the audit headline rec.
 */

import { resolvePort } from '@/lib/ports/resolve';
import PORT_DA_BASE from '@/scripts/seed-data/port-da-base.json';

interface PortDaEntry {
  port_code: string;
  port_name: string;
  brackets: unknown[];
}

const DA_ENTRIES = PORT_DA_BASE as PortDaEntry[];

describe('port-da ⇄ port-master reconciliation (CI gate)', () => {
  it('has at least the full known DA set (sanity: file loaded)', () => {
    expect(DA_ENTRIES.length).toBeGreaterThanOrEqual(54);
  });

  it.each(DA_ENTRIES.map((e) => [e.port_code, e.port_name] as const))(
    'resolvePort(%s name=%s) resolves back to its own port_code',
    (portCode, portName) => {
      const resolved = resolvePort(portName);
      expect(resolved).not.toBeNull();
      expect(resolved!.portCode).toBe(portCode);
    },
  );

  it('every DA port_code is present in port-master (LOCODE lookup)', () => {
    const unresolvable = DA_ENTRIES.filter((e) => resolvePort(e.port_code) === null).map(
      (e) => e.port_code,
    );
    expect(unresolvable).toEqual([]);
  });
});
