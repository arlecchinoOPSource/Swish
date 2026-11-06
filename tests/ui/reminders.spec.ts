import { test, expect, type Page } from '@playwright/test';

async function createProject(page: Page, name: string, deadline: string) {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Project deadline').fill(deadline);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function fillReminder(page: Page, title: string, text = '', due = '') {
  await page.getByLabel('Reminder header').fill(title);
  if (text) await page.getByLabel('Reminder text').fill(text);
  if (due) await page.getByLabel('Due date').fill(due);
}

const section = (page: Page, name: string) => page.locator('section.project').filter({ has: page.getByRole('heading', { name, exact: true }) });

test('regular and project reminders share one card and form', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic tour', '2026-12-31');

  await page.getByRole('button', { name: 'New Reminder in Synthetic tour' }).click();
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(/.+/);
  await fillReminder(page, 'Book rehearsal room', 'Two hours, synthetic.', '2027-01-15');
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Book rehearsal room' })).toBeFocused();

  await page.getByRole('button', { name: 'New Reminder in Regular Reminders' }).click();
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue('');
  await fillReminder(page, 'Water the plants');
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();

  const tour = section(page, 'Synthetic tour');
  await expect(tour.getByRole('heading', { name: 'Book rehearsal room' })).toBeVisible();
  // Due date after the project deadline is shown as entered: dates are independent.
  await expect(tour.locator('time[datetime="2027-01-15"]')).toBeVisible();
  const regular = section(page, 'Regular Reminders');
  await expect(regular.getByRole('heading', { name: 'Water the plants' })).toBeVisible();
  await expect(regular.locator('.due')).toHaveCount(0);
  for (const r of [tour, regular]) {
    await expect(r.locator('article.reminder .suite-completion')).toHaveCount(1);
    await expect(r.locator('article.reminder .destructive')).toHaveText('Delete Reminder');
    await expect(r.getByText('Not completed')).toBeVisible();
  }
});

test('rail Create opens a reminder form and validation guards header and date', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Project / Reminder' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New Reminder', exact: true }).click();
  await expect(page.getByLabel('Reminder header')).toBeFocused();
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Reminder header is required/);
  await expect(page.getByLabel('Reminder header')).toHaveAttribute('aria-invalid', 'true');
  await fillReminder(page, 'Synthetic optional date');
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(section(page, 'Regular Reminders').getByRole('heading', { name: 'Synthetic optional date' })).toBeVisible();
});

test('moving a reminder keeps its identity and clearing the due date works', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic A', '2026-12-01');
  await createProject(page, 'Synthetic B', '2026-12-02');
  await page.getByRole('button', { name: 'New Reminder in Synthetic A' }).click();
  await fillReminder(page, 'Traveller', 'Moves around', '2026-11-30');
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  const id = await page.getByRole('heading', { name: 'Traveller' }).getAttribute('id');

  await page.getByRole('button', { name: 'Edit reminder Traveller' }).click();
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Synthetic B' });
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await expect(section(page, 'Synthetic B').getByRole('heading', { name: 'Traveller' })).toHaveAttribute('id', id!);
  await expect(section(page, 'Synthetic A').getByText('No reminders in this project yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit reminder Traveller' })).toBeFocused();

  await page.getByRole('button', { name: 'Edit reminder Traveller' }).click();
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Regular Reminders (no project)' });
  await page.getByRole('button', { name: 'Clear due date' }).click();
  await page.getByLabel('Reminder header').fill('Traveller, home');
  await page.getByRole('button', { name: 'Save reminder' }).click();
  const moved = section(page, 'Regular Reminders').getByRole('heading', { name: 'Traveller, home' });
  await expect(moved).toHaveAttribute('id', id!);
  await expect(section(page, 'Regular Reminders').locator('.due')).toHaveCount(0);
});

test('failed reminder save keeps every field for retry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Reminder in Regular Reminders' }).click();
  await fillReminder(page, 'Synthetic fragile', 'Do not lose this text', '2026-12-05');
  await page.evaluate(() => { window.__swishPreviewFault = 'write'; });
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('simulated a storage failure');
  await expect(page.getByLabel('Reminder text')).toHaveValue('Do not lose this text');
  await expect(page.getByLabel('Due date')).toHaveValue('2026-12-05');
  await expect(page.locator('article.reminder')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic fragile' })).toBeVisible();
});

test('long reminder content wraps and project lists scroll by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 400 });
  await page.goto('/');
  await createProject(page, 'Synthetic long list', '2026-12-31');
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: 'New Reminder in Synthetic long list' }).click();
    await fillReminder(page, `Item ${i} ${'unbroken'.repeat(12)}`, 'Long text '.repeat(30));
    await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
    await expect(page.locator('article.reminder')).toHaveCount(i);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const list = page.getByRole('region', { name: 'Reminders in Synthetic long list' });
  await list.focus();
  const before = await list.evaluate(el => el.scrollTop);
  await page.keyboard.press('PageDown');
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(before);
});
