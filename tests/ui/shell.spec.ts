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
  await page.getByRole('option', { name: /^Ember Orange/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ember');
});
test('toolbar-free shell fits minimum window and large text', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 400 });
  await page.goto('/');
  await page.evaluate(() => document.documentElement.style.fontSize = '24px');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.toolbar')).toHaveCount(0);
  await expect(page.locator('.save-status')).toContainText('NOT SAVING');
});
test('preferences survive reload and OS reduced motion wins', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('combobox',{name:'Text size'}).selectOption('24');
 await page.getByRole('radio',{name:'Full'}).check();
 await page.getByRole('radio',{name:'Off'}).last().check();
 await page.emulateMedia({reducedMotion:'reduce'}); await expect(page.locator('html')).toHaveAttribute('data-motion','off');
 await page.reload(); await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Text size'})).toHaveValue('24');
 await expect(page.getByRole('group',{name:/Startup screen/}).getByRole('radio',{name:'Off'})).toBeChecked();
});

test('failed data load is explained and retried without inventing empty data', async ({ page }) => {
 await page.addInitScript(() => { window.__swishPreviewFault = 'load'; });
 await page.goto('/');
 await expect(page.getByRole('alert')).toContainText('Local data unavailable');
 await expect(page.locator('.save-status')).toContainText('LOCAL DATA UNAVAILABLE');
 await expect(page.getByText('No projects yet.')).toHaveCount(0);
 await page.getByRole('button',{name:'Try again'}).click();
 await expect(page.getByText('No projects yet.')).toBeVisible();
 await expect(page.locator('.save-status')).toContainText('NOT SAVING TO DISK');
});
