import { test, expect, type Page } from '@playwright/test';

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Project deadline').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function createReminder(page: Page, opener: string, title: string) {
  await page.getByRole('button', { name: opener }).click();
  await page.getByLabel('Reminder header').fill(title);
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

test('every project and reminder has a labelled red delete button', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic labels');
  await createReminder(page, 'New Reminder in Synthetic labels', 'In project');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Regular one');
  await expect(page.getByRole('button', { name: 'Delete project Synthetic labels and its 1 reminder' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete reminder In project' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete reminder Regular one' })).toBeEnabled();
  await expect(page.locator('.destructive:visible')).toHaveCount(3);
});

test('project deletion confirms with the count; cancel and Escape change nothing', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic doomed');
  await createReminder(page, 'New Reminder in Synthetic doomed', 'Child one');
  await createReminder(page, 'New Reminder in Synthetic doomed', 'Child two');
  await page.getByRole('checkbox', { name: 'Complete Child two' }).click();
  await createReminder(page, 'New Reminder in Regular Reminders', 'Survivor');

  const remove = page.getByRole('button', { name: /^Delete project Synthetic doomed/ });
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Delete project “Synthetic doomed”?' });
  await expect(dialog).toContainText('This also deletes its 2 reminders, completed or not.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();

  await remove.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Child one' })).toBeVisible();

  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic doomed' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Child one' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Child two' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Survivor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeFocused();
});

test('a failed project delete keeps the dialog open with retry and nothing removed', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic sturdy');
  await createReminder(page, 'New Reminder in Synthetic sturdy', 'Stays');
  await page.getByRole('button', { name: /^Delete project Synthetic sturdy/ }).click();
  await page.evaluate(() => { window.__swishPreviewFault = 'write'; });
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('simulated a storage failure');
  await expect(page.locator('.save-status')).toContainText('NOT SAVED');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Stays' })).toBeVisible();
});

test('reminder deletion offers undo that restores identity and completion', async ({ page }) => {
  await page.goto('/');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Comes back');
  const id = await page.getByRole('heading', { name: 'Comes back' }).getAttribute('id');
  await page.getByRole('checkbox', { name: 'Complete Comes back' }).click();
  await page.getByRole('button', { name: 'Delete reminder Comes back' }).click();
  await expect(page.getByRole('heading', { name: 'Comes back' })).toHaveCount(0);
  const bar = page.getByRole('region', { name: 'Deleted reminder' });
  await expect(bar).toContainText('Deleted reminder “Comes back”.');
  await expect(bar.getByRole('button', { name: 'Undo delete' })).toBeFocused();
  await expect(bar).toContainText('Undo stays available while you are here.');
  await bar.getByRole('button', { name: 'Undo delete' }).click();
  await expect(page.getByRole('heading', { name: 'Comes back' })).toHaveAttribute('id', id!);
  await expect(page.getByRole('heading', { name: 'Comes back' })).toBeFocused();
  await expect(page.getByRole('checkbox', { name: 'Complete Comes back' })).toBeChecked();
  await expect(bar).toHaveCount(0);
});

test('undo expires after the window unless focused, then deletion is final', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await createReminder(page, 'New Reminder in Regular Reminders', 'Really gone');
  await page.getByRole('button', { name: 'Delete reminder Really gone' }).click();
  const bar = page.getByRole('region', { name: 'Deleted reminder' });
  await expect(bar).toBeVisible();
  // Move focus and the pointer away so the countdown runs.
  await page.getByRole('heading', { name: 'Regular Reminders' }).click();
  await page.mouse.move(0, 0);
  await page.getByRole('button', { name: 'New Project', exact: true }).focus();
  await expect(bar).toContainText('Undo available for');
  await page.clock.runFor(11_000);
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Really gone' })).toHaveCount(0);
});

test('undo is refused cleanly when its project was deleted meanwhile', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic parent');
  await createReminder(page, 'New Reminder in Synthetic parent', 'Child');
  await page.getByRole('button', { name: 'Delete reminder Child' }).click();
  await page.getByRole('button', { name: /^Delete project Synthetic parent and its 0 reminders/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();
  await page.getByRole('button', { name: 'Undo delete' }).click();
  await expect(page.getByRole('region', { name: 'Deleted reminder' }).getByRole('alert')).toContainText('cannot be restored');
  await expect(page.getByRole('heading', { name: 'Child' })).toHaveCount(0);
});
