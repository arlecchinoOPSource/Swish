import { test, expect } from '@playwright/test';
test('navigation opens, Escape returns focus, and themes change', async ({ page }) => {
  await page.goto('/');
  for (const label of ['Search', 'Create Project / Reminder', 'Themes', 'Sounds', 'Settings']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.getByRole('radio', { name: 'Ember Orange' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ember');
});
test('toolbar-free shell fits minimum window and large text', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 400 });
  await page.goto('/');
  await page.evaluate(() => document.documentElement.style.fontSize = '24px');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.toolbar')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('NOT SAVING');
});
