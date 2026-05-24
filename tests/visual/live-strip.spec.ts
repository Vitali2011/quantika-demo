import { test, expect } from '@playwright/test';

test('LiveStrip hidden when no active jobs', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', { name: /live email processing/i })).toHaveCount(0);
});

test('LiveStrip visible with mock job via SSE route interception', async ({ page }) => {
  await page.route('**/api/jobs/stream', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: job-update',
        'data: {"id":"j1","status":"processing","progress_percent":50,"from":"Boris","email_subject":"HSS cargo"}',
        '',
        '',
      ].join('\n'),
    });
  });
  await page.goto('/matches');
  await page.waitForTimeout(500);
  await expect(page.getByRole('region', { name: /live email processing/i })).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
});
