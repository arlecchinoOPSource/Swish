import { test, expect, type Page } from '@playwright/test';

async function createProject(page: Page, name: string, deadline: string, description = '') {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  if (description) await page.getByLabel('Description').fill(description);
  await page.getByLabel('Project deadline').fill(deadline);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
}

test('create projects from the canvas and the rail, ordered by deadline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No projects yet.')).toBeVisible();
  await createProject(page, 'Synthetic later plan', '2027-02-01', 'Line one\nLine two');
  const heading = page.getByRole('heading', { name: 'Synthetic later plan' });
  await expect(heading).toBeFocused();
  await expect(page.getByText('Line one\nLine two')).toBeVisible();

  await page.getByRole('button', { name: 'Create Project / Reminder' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^New Project/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toBeFocused();
  await page.getByLabel('Project name').fill('Synthetic sooner plan');
  await page.getByLabel('Project deadline').fill('2026-12-15');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();

  await expect(page.locator('.project h2[id^=project-]')).toHaveText(['Synthetic sooner plan', 'Synthetic later plan']);
  await expect(page.locator('time[datetime="2026-12-15"]')).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('NOT SAVING TO DISK');
  await expect(page.locator('.save-status')).not.toContainText(/^SAVED$/);
});

test('edit keeps the project identity and Cancel leaves it unchanged', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Synthetic draft', '2026-12-01');
  const id = await page.getByRole('heading', { name: 'Synthetic draft' }).getAttribute('id');
  await page.getByRole('button', { name: 'Edit project Synthetic draft' }).click();
  await page.getByLabel('Project name').fill('Discarded name');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit project Synthetic draft' })).toBeFocused();

  await page.getByRole('button', { name: 'Edit project Synthetic draft' }).click();
  await page.getByLabel('Project name').fill('Synthetic final');
  await page.getByLabel('Project deadline').fill('2027-01-31');
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic final' })).toHaveAttribute('id', id!);
  await expect(page.locator('time[datetime="2027-01-31"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit project Synthetic final' })).toBeFocused();
});

test('validation names the field and blocks the write', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Project name is required/);
  await expect(page.getByLabel('Project name')).toBeFocused();
  await expect(page.getByLabel('Project name')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Project name').fill('   ');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Project name is required/);
  await page.getByLabel('Project name').fill('Synthetic needs a date');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Deadline is required/);
  await expect(page.getByLabel('Project deadline')).toBeFocused();
  await expect(page.locator('.project h2[id^=project-]')).toHaveCount(0);
});

test('a failed save keeps the draft and retry succeeds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill('Synthetic resilient plan');
  await page.getByLabel('Description').fill('Typed before the failure');
  await page.getByLabel('Project deadline').fill('2026-12-20');
  await page.evaluate(() => { window.__swishPreviewFault = 'write'; });
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('simulated a storage failure');
  await expect(page.locator('.save-status')).toContainText('NOT SAVED — YOUR CHANGES ARE KEPT FOR RETRY');
  await expect(page.getByLabel('Project name')).toHaveValue('Synthetic resilient plan');
  await expect(page.getByLabel('Description')).toHaveValue('Typed before the failure');
  await expect(page.locator('.project h2[id^=project-]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic resilient plan' })).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('NOT SAVING TO DISK');
});

test('many long projects stay readable at small sizes', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 400 });
  await page.goto('/');
  for (let i = 1; i <= 4; i++) await createProject(page, `Synthetic project ${i} ${'with a very long unbroken name '.repeat(3)}`, `2026-12-0${i}`);
  await expect(page.locator('.project h2[id^=project-]')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /^Edit project Synthetic project 4/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /^Edit project Synthetic project 4/ })).toBeInViewport();
});
