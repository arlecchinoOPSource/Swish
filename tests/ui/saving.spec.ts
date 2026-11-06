import { test, expect, type Page } from '@playwright/test';

async function createReminder(page: Page, title: string, due = '') {
  await page.getByRole('button', { name: 'New Reminder in Regular Reminders' }).click();
  await page.getByLabel('Reminder header').fill(title);
  if (due) await page.getByLabel('Due date').fill(due);
  await page.getByRole('button', { name: 'Create reminder', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

async function createProject(page: Page, name: string, deadline: string) {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Project deadline').fill(deadline);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('rapid changes are written one at a time and the status waits for all of them', async ({ page }) => {
  await page.goto('/');
  for (const t of ['One', 'Two', 'Three']) await createReminder(page, t);
  await page.evaluate(() => { window.__swishPreviewDelay = 250; window.__swishPreviewOverlap = false; });
  for (const t of ['One', 'Two', 'Three']) await page.getByRole('checkbox', { name: `Complete ${t}` }).click();
  await expect(page.locator('.save-status')).toContainText('SAVING…');
  for (const t of ['One', 'Two', 'Three']) await expect(page.getByRole('checkbox', { name: `Complete ${t}` })).toBeChecked();
  await expect(page.locator('.save-status')).toContainText('NOT SAVING TO DISK');
  expect(await page.evaluate(() => window.__swishPreviewOverlap)).toBe(false);
});

test('a failure in the middle of a queue is reported and the others still save', async ({ page }) => {
  await page.goto('/');
  for (const t of ['First', 'Second']) await createReminder(page, t);
  await page.evaluate(() => { window.__swishPreviewDelay = 150; window.__swishPreviewFault = 'write'; });
  await page.getByRole('checkbox', { name: 'Complete First' }).click();
  await page.getByRole('checkbox', { name: 'Complete Second' }).click();
  await expect(page.getByRole('alert')).toContainText('Not marked complete');
  await expect(page.getByRole('checkbox', { name: 'Complete First' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Complete Second' })).toBeChecked();
});

test('overdue and due-today are stated in words; completion clears overdue', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00'));
  await page.goto('/');
  await createReminder(page, 'Late one', '2026-11-05');
  await createReminder(page, 'Today one', '2026-11-06');
  await createReminder(page, 'Later one', '2026-11-07');
  const card = (t: string) => page.locator('article.reminder', { has: page.getByRole('heading', { name: t }) });
  await expect(card('Late one').locator('.due')).toHaveText(/^⚠ Overdue · was due Nov 5, 2026$/);
  await expect(card('Today one').locator('.due')).toHaveText(/^● Due today · Nov 6, 2026$/);
  await expect(card('Later one').locator('.due')).toHaveText(/^Due Nov 7, 2026$/);
  await page.getByRole('checkbox', { name: 'Complete Late one' }).click();
  await expect(card('Late one').locator('.due')).toHaveText(/^Due Nov 5, 2026$/);

  await createProject(page, 'Past project', '2026-11-01');
  await expect(page.locator('section.project', { has: page.getByRole('heading', { name: 'Past project' }) }).locator('.project-heading .due')).toHaveText(/Deadline passed · was Nov 1, 2026/);
});

test('the overdue state updates at local midnight without a reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-06T23:59:00') });
  await page.goto('/');
  await createReminder(page, 'Due tonight', '2026-11-06');
  const due = page.locator('article.reminder .due');
  await expect(due).toHaveText(/Due today/);
  await page.clock.runFor(2 * 60_000);
  await expect(due).toHaveText(/Overdue/);
});

for (const timezoneId of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Santiago', 'Asia/Kolkata']) {
  test.describe(`time zone ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('dates display exactly as entered and "today" follows local time', async ({ page }) => {
      // 10:30 UTC is already Nov 7 in Kiritimati (UTC+14) and still Nov 5 23:30 in Pago Pago (UTC−11).
      await page.clock.setFixedTime(new Date('2026-11-06T10:30:00Z'));
      await page.goto('/');
      await createReminder(page, 'Boundary', '2026-11-06');
      await expect(page.locator('time[datetime="2026-11-06"]')).toHaveText('Nov 6, 2026');
      const local = await page.evaluate(() => new Date().getDate());
      const expected = local === 7 ? /Overdue/ : local === 5 ? /^Due Nov 6/ : /Due today/;
      await expect(page.locator('article.reminder .due')).toHaveText(expected);
    });
  });
}

test('unsaved typing survives a reload and can be reopened or discarded', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.getByLabel('Project name').fill('Half-typed plan');
  await page.getByLabel('Description').fill('Typed before the window closed');
  await page.reload();
  const recovered = page.getByRole('region', { name: 'Unsaved changes kept on this device' });
  await expect(recovered).toContainText('New project “Half-typed plan”');
  await recovered.getByRole('button', { name: 'Reopen New project “Half-typed plan”' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Half-typed plan');
  await expect(page.getByLabel('Description')).toHaveValue('Typed before the window closed');
  await expect(recovered).toHaveCount(0);
  await page.getByLabel('Project deadline').fill('2026-12-01');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Half-typed plan' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Unsaved changes kept on this device' })).toHaveCount(0);
});

test('switching to another form keeps the first draft; cancel and discard remove drafts', async ({ page }) => {
  await page.goto('/');
  await createReminder(page, 'Existing');
  await page.getByRole('button', { name: 'Edit reminder Existing' }).click();
  await page.getByLabel('Reminder text').fill('Edited but not saved');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const recovered = page.getByRole('region', { name: 'Unsaved changes kept on this device' });
  await expect(recovered).toContainText('Changes to reminder “Existing”');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // Opening the edit form again brings the kept typing back.
  await page.getByRole('button', { name: 'Edit reminder Existing' }).click();
  await expect(page.getByLabel('Reminder text')).toHaveValue('Edited but not saved');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(recovered).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit reminder Existing' }).click();
  await expect(page.getByLabel('Reminder text')).toHaveValue('');
  await page.getByLabel('Reminder text').fill('Throw away');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await recovered.getByRole('button', { name: 'Discard Changes to reminder “Existing”' }).click();
  await expect(recovered).toHaveCount(0);
});

test('corrupt draft storage is ignored and Settings states there are no background alerts', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('swish.drafts.v1', '{"not":"a list"'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unsaved changes kept on this device' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('does not send background alerts');
});
