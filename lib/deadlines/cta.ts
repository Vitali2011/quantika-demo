/**
 * CTA «Draft extension request?» resolver.
 *
 * При stage='2h' UI показывает кнопку. Если β-11 (Plan-First) merged —
 * триггерим `POST /api/agent/plan`. Иначе — graceful fallback: открываем
 * prefilled mailto-черновик. Detection делается через runtime require, а
 * не статический import — чтобы билд не падал, если модуля ещё нет.
 */

export interface CtaInput {
  dealId: string;
  counterparty: string;
  counterpartyEmail?: string;
  deadlineAt: string;
  /**
   * Override for tests / SSR — иначе пытаемся детектить runtime.
   */
  planFirstAvailable?: boolean;
}

export interface CtaResult {
  kind: 'plan-first' | 'mailto';
  href: string;
  label: string;
}

function detectPlanFirstAvailable(): boolean {
  try {
    // Lazy detection — не валим билд, если модуля нет.
    require.resolve('@/lib/agent/plan-first');
    return true;
  } catch {
    return false;
  }
}

function buildMailto(input: CtaInput): string {
  const to = input.counterpartyEmail ?? '';
  const subject = encodeURIComponent(
    `Subs deadline extension request — deal ${input.dealId}`,
  );
  const body = encodeURIComponent(
    [
      `Dear ${input.counterparty},`,
      '',
      `Re: subs deadline currently set for ${input.deadlineAt}.`,
      '',
      'We kindly request a short extension to allow owners to finalise approval.',
      'Please confirm at your earliest convenience.',
      '',
      'Best regards,',
    ].join('\n'),
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

export function resolveExtensionCta(input: CtaInput): CtaResult {
  const available =
    input.planFirstAvailable ?? detectPlanFirstAvailable();

  if (available) {
    return {
      kind: 'plan-first',
      href: '/api/agent/plan',
      label: 'Draft extension request',
    };
  }

  return {
    kind: 'mailto',
    href: buildMailto(input),
    label: 'Draft extension request',
  };
}
