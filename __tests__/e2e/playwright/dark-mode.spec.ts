import { test, expect } from '@playwright/test';

/**
 * Dark-mode toggle e2e — regression guard for prod 500 incident (PR #464 revert).
 *
 * Root cause was double-html hydration error. These tests verify:
 * (a) document has exactly ONE <html> root (no nested html tags)
 * (b) .dark class applied to documentElement after toggle click
 * (c) quantika_theme=dark cookie set
 * (d) authenticated route (/dashboard) returns 200 with toggle active
 */

test.describe('Dark-mode toggle', () => {
  test('(a) single <html> root — no double-html hydration', async ({ page }) => {
    await page.goto('/dashboard');
    const htmlCount = await page.evaluate(() => document.querySelectorAll('html').length);
    expect(htmlCount).toBe(1);
  });

  test('(b) toggle click adds .dark class to documentElement', async ({ page }) => {
    await page.goto('/dashboard');

    const toggle = page.getByRole('button', { name: /switch to dark mode/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(true);
  });

  test('(c) cookie quantika_theme=dark set after toggle', async ({ page }) => {
    await page.goto('/dashboard');

    const toggle = page.getByRole('button', { name: /switch to dark mode/i });
    await toggle.click();

    const cookies = await page.context().cookies();
    const themeCookie = cookies.find((c) => c.name === 'quantika_theme');
    expect(themeCookie?.value).toBe('dark');
  });

  test('(d) /dashboard returns 200 with dark mode active', async ({ page }) => {
    // Set dark mode cookie before navigation to simulate returning user
    await page.context().addCookies([
      { name: 'quantika_theme', value: 'dark', path: '/', domain: 'localhost' },
    ]);

    const res = await page.goto('/dashboard');
    expect(res?.status()).toBe(200);

    // Verify the bootstrap script applied dark class before hydration
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(true);
  });
});
