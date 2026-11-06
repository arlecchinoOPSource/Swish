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
  await expect(page.locator('.save-status')).toContainText('NOT SAVING');
});
test('sample cards use accessible completion and explicit unsaved state', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button',{name:'Preview sample layout'}).click();
 const check = page.getByRole('checkbox',{name:'Complete Debug the desktop shell'});
 await check.focus(); await page.keyboard.press('Space'); await expect(check).toBeChecked();
 await expect(page.getByText('Sample layout — changes are not saved.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Delete Reminder'})).toHaveCount(3);
 await page.reload(); await expect(page.getByRole('checkbox',{name:'Complete Debug the desktop shell'})).toHaveCount(0);
});
test('preferences survive reload and OS reduced motion wins', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('combobox',{name:'Text size'}).selectOption('24');
 await page.getByRole('combobox',{name:'Motion'}).selectOption('full');
 await page.emulateMedia({reducedMotion:'reduce'}); await expect(page.locator('html')).toHaveAttribute('data-motion','off');
 await page.keyboard.press('Escape'); await page.getByRole('button',{name:'Sounds',exact:true}).click();
 await page.getByRole('checkbox',{name:'Mute all sounds'}).check();
 await expect(page.getByRole('button',{name:'Preview Completion'})).toBeDisabled();
 await page.reload(); await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Text size'})).toHaveValue('24');
 await page.keyboard.press('Escape'); await page.getByRole('button',{name:'Sounds',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Mute all sounds'})).toBeChecked();
});
test('bundled audio previews decode and mute blocks playback', async ({ page }) => {
 await page.addInitScript(() => {
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
   return play.call(this).then(() => { document.documentElement.dataset.audioPlayed = 'yes'; });
  };
 });
 await page.goto('/'); await page.getByRole('button',{name:'Sounds',exact:true}).click();
 await page.getByRole('button',{name:'Preview Completion'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-audio-played','yes');
 await page.getByRole('checkbox',{name:'Mute all sounds'}).check();
 await expect(page.getByRole('button',{name:'Preview Completion'})).toBeDisabled();
});
