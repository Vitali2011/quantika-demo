/**
 * Hydration regression smoke (βf2-05).
 *
 * Wave β зафиксировала React #418 на homepage через `suppressHydrationWarning`
 * (PR #47, βf-13). Post-deploy retest показал что на dynamic routes (`/cargo/[id]`,
 * `/vessel/[id]`) #418 ещё всплывал — на этой ветке (claude/wave-betaf-2) уже не
 * воспроизводится локально на dev, но prod-environment может отличаться (env vars,
 * data, timing).
 *
 * Этот smoke — permanent regression guard: ловим React hydration ошибки на 5 ключевых
 * routes (homepage, dashboard, cargo detail, vessel detail, onboarding). Запускается
 * в smoke pipeline и через `test:smoke:prod` против https://demo.quantika.org после
 * деплоя.
 *
 * Если test fail'нет в CI или prod — collect console.log из output и assess root cause:
 *   - timezone/locale mismatch SSR↔client (Date formatting)
 *   - localStorage/sessionStorage чтение в render (нужно useEffect mount-guard)
 *   - third-party script injection (нужно `<Script strategy="afterInteractive" />`)
 *   - dynamic content рендерится по-разному из-за seed/random
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/', name: 'homepage' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/cargo/sample-01', name: 'cargo-detail' },
  { path: '/vessel/sample-13', name: 'vessel-detail' },
  { path: '/onboarding', name: 'onboarding' },
];

const HYDRATION_PATTERNS = [
  /Minified React error #418/i,
  /Minified React error #423/i,
  /Minified React error #425/i,
  /Hydration failed/i,
  /Text content does not match server-rendered HTML/i,
  /did not match.*server/i,
];

for (const route of ROUTES) {
  test(`hydration: ${route.name} (${route.path}) — no React #418/423/425`, async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      errors.push(`${err.message}\n${err.stack ?? ''}`);
    });

    await page.goto(route.path, { waitUntil: 'networkidle', timeout: 20_000 });
    // Allow React time to rehydrate + run effects
    await page.waitForTimeout(2_000);

    const hydrationErrors = errors.filter((e) =>
      HYDRATION_PATTERNS.some((p) => p.test(e)),
    );

    if (hydrationErrors.length > 0) {
      // Print first 2 errors verbatim for debug
      for (const e of hydrationErrors.slice(0, 2)) {
         
        console.log(`[${route.name}] ${e.substring(0, 1200)}`);
      }
    }

    expect(
      hydrationErrors,
      `${route.name} (${route.path}) had ${hydrationErrors.length} hydration error(s)`,
    ).toEqual([]);
  });
}
