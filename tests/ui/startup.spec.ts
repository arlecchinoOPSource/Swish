import { test, expect } from '@playwright/test';

test('startup gives the wordmark time to settle before closing', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.startup')).toHaveAttribute('data-state', 'ready');
  await page.clock.runFor(1100);
  await expect(page.locator('.startup')).toHaveAttribute('data-exiting', 'false');
  await page.clock.runFor(1400);
  await expect(page.locator('.startup')).toHaveCount(0);
});

for (const skip of ['keyboard', 'pointer', 'reduced motion', 'disabled'] as const) {
  test(`startup remains immediate with ${skip}`, async ({ page }) => {
    if (skip === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    if (skip === 'disabled') await page.addInitScript(() => localStorage.setItem('swish.preferences.v1', JSON.stringify({ startup: false })));
    await page.clock.install();
    await page.goto('/');
    if (skip === 'keyboard' || skip === 'pointer') await expect(page.locator('.startup')).toBeVisible();
    if (skip === 'keyboard') await page.keyboard.press('Escape');
    if (skip === 'pointer') await page.mouse.click(20, 20);
    await expect(page.locator('.startup')).toHaveCount(0, { timeout: 500 });
  });
}
