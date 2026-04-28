/**
 * DOM rendering helpers for the Quantika sidebar.
 * Vanilla TS — no React.
 */

type ConfidenceField<T> = { value: T; confidence: string } | T | null;

function fieldValue<T>(f: ConfidenceField<T>): T | null {
  if (f === null || f === undefined) return null;
  if (typeof f === 'object' && 'value' in (f as object)) {
    return (f as { value: T }).value;
  }
  return f as T;
}

export function renderCargo(
  container: HTMLElement,
  cargo: Record<string, unknown> | null,
): void {
  container.innerHTML = '';
  if (!cargo) {
    container.innerHTML = '<span style="color:#9ca3af;font-size:12px">No cargo parsed yet</span>';
    return;
  }

  const fields: Array<{ label: string; key: string }> = [
    { label: 'Origin', key: 'originPort' },
    { label: 'Destination', key: 'destinationPort' },
    { label: 'Cargo', key: 'cargoDescription' },
    { label: 'Weight (MT)', key: 'weightMt' },
    { label: 'Laycan', key: 'laycan' },
  ];

  for (const { label, key } of fields) {
    const raw = cargo[key] as ConfidenceField<unknown>;
    const val = fieldValue(raw);
    if (val === null || val === undefined) continue;

    const row = document.createElement('div');
    row.className = 'field';
    row.innerHTML = `<span class="field-label">${label}:</span><span class="field-value">${val}</span>`;
    container.appendChild(row);
  }
}

export function renderVessels(
  container: HTMLElement,
  matches: Array<{ vessel: Record<string, unknown>; score: number }>,
  onSelect: (match: { vessel: Record<string, unknown>; score: number }, index: number) => void,
): void {
  container.innerHTML = '';
  if (matches.length === 0) {
    container.innerHTML = '<span style="color:#9ca3af;font-size:12px">No vessel matches yet</span>';
    return;
  }

  matches.forEach((m, i) => {
    const name = (m.vessel.vesselName as string) || 'Unknown vessel';
    const stars = scoreToStars(m.score);
    const div = document.createElement('div');
    div.className = 'vessel-item';
    div.dataset.index = String(i);
    div.innerHTML = `
      <div class="vessel-name">${name} ${stars}</div>
      <div class="vessel-score">Score: ${(m.score * 100).toFixed(0)}%</div>
    `;
    div.addEventListener('click', () => {
      container.querySelectorAll('.vessel-item').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      onSelect(m, i);
    });
    container.appendChild(div);
  });
}

export function renderPassport(
  container: HTMLElement,
  vessel: Record<string, unknown> | null,
): void {
  container.innerHTML = '';
  if (!vessel) {
    container.innerHTML = '<span class="passport-na">Select a vessel above</span>';
    return;
  }

  const checks: Array<{ label: string; key: string }> = [
    { label: 'Flag', key: 'flag' },
    { label: 'Class', key: 'class' },
  ];

  for (const { label, key } of checks) {
    const val = vessel[key];
    const row = document.createElement('div');
    row.className = 'passport-row';
    row.innerHTML = `<span>${label}</span><span class="${val ? 'passport-ok' : 'passport-na'}">${val ? `✅ ${val}` : '—'}</span>`;
    container.appendChild(row);
  }
}

function scoreToStars(score: number): string {
  const n = Math.round(score * 5);
  return '⭐'.repeat(Math.max(0, Math.min(5, n)));
}
