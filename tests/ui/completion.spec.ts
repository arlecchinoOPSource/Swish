import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill('Synthetic progress');
  await page.getByLabel('Project deadline').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByText('No reminders in this project yet.')).toBeVisible();
  for (const title of ['First step', 'Second step']) {
    await page.getByRole('button', { name: 'New Reminder in Synthetic progress' }).click();
    await page.getByLabel('Reminder header').fill(title);
    await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
}

test('completion toggles by keyboard, keeps the reminder, and drives progress', async ({ page }) => {
  await setup(page);
  await expect(page.getByText('0 of 2 completed')).toBeVisible();
  const first = page.getByRole('checkbox', { name: 'Complete First step' });
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  await expect(page.getByText('1 of 2 completed')).toBeVisible();
  await expect(page.locator('article', { has: first }).getByText('Completed', { exact: false })).toHaveText('✓ Completed');

  const second = page.getByRole('checkbox', { name: 'Complete Second step' });
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('2 of 2 completed — all done')).toBeVisible();
  await expect(page.locator('article.reminder')).toHaveCount(2);

  await first.click();
  await expect(first).not.toBeChecked();
  await expect(page.getByText('1 of 2 completed')).toBeVisible();
  await expect(page.locator('article', { has: first }).locator('.completion-label')).toHaveText('Not completed');
});

test('regular reminders complete with the same control and no project progress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Reminder in Regular Reminders' }).click();
  await page.getByLabel('Reminder header').fill('Standalone');
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  const box = page.getByRole('checkbox', { name: 'Complete Standalone' });
  await box.click();
  await expect(box).toBeChecked();
  await expect(page.locator('.project-progress')).toHaveCount(0);
});

test('a failed completion save shows the stored state and retries', async ({ page }) => {
  await setup(page);
  const first = page.getByRole('checkbox', { name: 'Complete First step' });
  await page.evaluate(() => { window.__swishPreviewFault = 'write'; });
  await first.click();
  await expect(page.getByRole('alert')).toContainText('Not marked complete');
  await expect(first).not.toBeChecked();
  await expect(page.getByText('0 of 2 completed')).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('NOT SAVED');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(first).toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('1 of 2 completed')).toBeVisible();
});

test('editing a completed reminder keeps it completed', async ({ page }) => {
  await setup(page);
  await page.getByRole('checkbox', { name: 'Complete First step' }).click();
  await page.getByRole('button', { name: 'Edit reminder First step' }).click();
  await page.getByLabel('Reminder header').fill('First step, renamed');
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete First step, renamed' })).toBeChecked();
  await expect(page.getByText('1 of 2 completed')).toBeVisible();
});
